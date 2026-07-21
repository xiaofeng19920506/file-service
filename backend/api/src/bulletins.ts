import { createHash } from 'node:crypto';
import { asc, desc, eq, and } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blobs,
  bulletinAnnouncements,
  canManageBulletin,
  canViewBulletin,
  canEditBulletinWorshipSongs,
  exportPptxSlidePng,
  fetchYoutubePlaylistData,
  fetchOauthYoutubePlaylistItems,
  mapYoutubeApiError,
  normalizeUserRole,
  patchBulletinPreviewInPptx,
  buildBulletinDeckPlanFromPptxBytes,
  extractPresentationSlideAsPptx,
  extractIndexedTextRunsFromPptx,
  playlistItems,
  playlists,
  renderSlidePngViaService,
  resolveScriptureSlideBodies,
  getScripturePreference,
  purgeExpiredScripturePreferences,
  upsertScripturePreference,
  weeklyBulletins,
  signPlaylistEditToken,
  formatUserDisplayName,
  normalizeHiddenSections,
  normalizeSlideTextOverrides,
  type ApiEnv,
  type Db,
  type SlideTextOverride,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import { getValidYoutubeAccessToken, resolveOAuthConfig } from './youtube-oauth-token.js';
import { notifyBulletinUpdated } from './bulletin-realtime.js';
import { resolveMailConfig, resolveWebAppUrl, sendMail } from './mail.js';
import { appendVideosToPlaylist, buildPlaylistDetail } from './playlists.js';

function resolveBulletinTemplateDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../../shared/templates/bulletin'),
    join(process.cwd(), 'shared/templates/bulletin'),
    join(process.cwd(), '../shared/templates/bulletin'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, '06_14_2026.pptx'))) return dir;
  }
  return candidates[0]!;
}

const BULLETIN_TEMPLATE_FILE = '06_14_2026.pptx';

const BULLETIN_TEMPLATE_DIR = resolveBulletinTemplateDir();

const slidePreviewCache = new Map<string, Buffer>();
/** 同一套补丁参数共享已补丁 PPTX，避免每页都重新 patch */
const patchedPptxCache = new Map<string, Buffer>();
/** 预览补丁版本；v29=生日只留 P24 + 生日/金句实时补丁 */
const SLIDE_PREVIEW_PATCH_REV = 'v29';

function slideOverridesCacheKey(overrides: readonly SlideTextOverride[]): string {
  if (!overrides.length) return '';
  const payload = overrides
    .map((o) => `${o.slide}:${o.textIndex}:${o.text}`)
    .join('\n');
  return createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

type PreviewQueryFields = {
  serviceDate?: string;
  serviceTime: string;
  scriptureBook: string;
  scriptureReference: string;
  showPreServiceChairName: boolean;
  preServiceChairNames: string;
  birthdayMonth: string;
  birthdayNames: string;
  verseOfWeek: string;
  hiddenSections: string[];
  weeklyMeetingVariant: number | null;
};

function parsePreviewQuery(query: {
  serviceDate?: string;
  serviceTime?: string;
  scriptureBook?: string;
  scriptureReference?: string;
  showPreServiceChairName?: string;
  preServiceChairNames?: string;
  birthdayMonth?: string;
  birthdayNames?: string;
  verseOfWeek?: string;
  hiddenSections?: string;
  weeklyMeetingVariant?: string;
}): PreviewQueryFields {
  const variantRaw = query.weeklyMeetingVariant?.trim();
  return {
    serviceDate: query.serviceDate?.trim(),
    serviceTime: query.serviceTime?.trim() || '11:00',
    scriptureBook: query.scriptureBook?.trim() ?? '',
    scriptureReference: query.scriptureReference?.trim() ?? '',
    showPreServiceChairName:
      query.showPreServiceChairName === '1' || query.showPreServiceChairName === 'true',
    preServiceChairNames: query.preServiceChairNames?.trim() ?? '',
    birthdayMonth: query.birthdayMonth?.trim() ?? '',
    birthdayNames: query.birthdayNames?.trim() ?? '',
    verseOfWeek: query.verseOfWeek?.trim() ?? '',
    hiddenSections: normalizeHiddenSections(
      (query.hiddenSections ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    weeklyMeetingVariant:
      variantRaw && /^\d+$/.test(variantRaw) ? Number.parseInt(variantRaw, 10) : null,
  };
}

function previewPatchCacheSuffix(
  q: PreviewQueryFields,
  overridesKey: string,
): string {
  const hiddenKey = q.hiddenSections.slice().sort().join(',');
  return `${q.serviceDate ?? ''}:${q.serviceTime}:${q.scriptureBook}:${q.scriptureReference}:${q.showPreServiceChairName}:${q.preServiceChairNames}:${q.birthdayMonth}:${q.birthdayNames}:${q.verseOfWeek}:${hiddenKey}:${q.weeklyMeetingVariant ?? ''}:${overridesKey}`;
}

let previewRenderActive = 0;
const previewRenderWaiters: Array<() => void> = [];
const PREVIEW_RENDER_MAX = 2;

async function withPreviewRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (previewRenderActive >= PREVIEW_RENDER_MAX) {
    await new Promise<void>((resolve) => previewRenderWaiters.push(resolve));
  }
  previewRenderActive++;
  try {
    return await fn();
  } finally {
    previewRenderActive--;
    const next = previewRenderWaiters.shift();
    if (next) next();
  }
}

function rememberLru(map: Map<string, Buffer>, key: string, value: Buffer, max: number) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest == null) break;
    map.delete(oldest);
  }
}

export type BulletinAnnouncementDto = {
  id: string;
  sortOrder: number;
  category: string;
  title: string;
  body: string;
};

export type WeeklyBulletinDto = {
  id: string;
  serviceDate: string;
  serviceTime: string;
  status: string;
  lastWeekOfferingDate: string;
  offeringQuarterLabel: string;
  birthdayMonth: string;
  birthdayNames: string;
  showPreServiceChairName: boolean;
  preServiceChairNames: string;
  staffMeetingDate: string;
  testimonyShareDate: string;
  serviceRosterText: string;
  baptismText: string;
  scriptureBook: string;
  scriptureReference: string;
  verseOfWeek: string;
  weeklyMeetingVariant: number | null;
  skipTestimonyWeek: boolean;
  skipDepartmentReports: boolean;
  hiddenSections: string[];
  slideTextOverrides: { slide: number; textIndex: number; text: string }[];
  servicePlaylistId: string | null;
  worshipLyricsPptxBlobId: string | null;
  outputBlobId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string | null;
  announcements: BulletinAnnouncementDto[];
};

function requireUser(request: import('fastify').FastifyRequest) {
  const user = request.authUser;
  if (!user) return null;
  return { ...user, role: normalizeUserRole(user.role) };
}

function mapAnnouncement(row: typeof bulletinAnnouncements.$inferSelect): BulletinAnnouncementDto {
  return {
    id: row.id,
    sortOrder: row.sortOrder,
    category: row.category,
    title: row.title,
    body: row.body,
  };
}

async function loadAnnouncements(db: Db, bulletinId: string): Promise<BulletinAnnouncementDto[]> {
  const rows = await db
    .select()
    .from(bulletinAnnouncements)
    .where(eq(bulletinAnnouncements.bulletinId, bulletinId))
    .orderBy(asc(bulletinAnnouncements.sortOrder));
  return rows.map(mapAnnouncement);
}

async function mapBulletin(
  db: Db,
  row: typeof weeklyBulletins.$inferSelect,
): Promise<WeeklyBulletinDto> {
  const announcements = await loadAnnouncements(db, row.id);
  return {
    id: row.id,
    serviceDate: row.serviceDate,
    serviceTime: row.serviceTime,
    status: row.status,
    lastWeekOfferingDate: row.lastWeekOfferingDate,
    offeringQuarterLabel: row.offeringQuarterLabel,
    birthdayMonth: row.birthdayMonth,
    birthdayNames: row.birthdayNames,
    showPreServiceChairName: row.showPreServiceChairName,
    preServiceChairNames: row.preServiceChairNames,
    staffMeetingDate: row.staffMeetingDate,
    testimonyShareDate: row.testimonyShareDate,
    serviceRosterText: row.serviceRosterText,
    baptismText: row.baptismText,
    scriptureBook: row.scriptureBook,
    scriptureReference: row.scriptureReference,
    verseOfWeek: row.verseOfWeek,
    weeklyMeetingVariant: row.weeklyMeetingVariant,
    skipTestimonyWeek: row.skipTestimonyWeek,
    skipDepartmentReports: row.skipDepartmentReports,
    hiddenSections: Array.isArray(row.hiddenSections) ? row.hiddenSections : [],
    slideTextOverrides: normalizeSlideTextOverrides(row.slideTextOverrides),
    servicePlaylistId: row.servicePlaylistId,
    worshipLyricsPptxBlobId: row.worshipLyricsPptxBlobId,
    outputBlobId: row.outputBlobId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    announcements,
  };
}

type BulletinPatchBody = Partial<{
  serviceDate: string;
  serviceTime: string;
  status: string;
  lastWeekOfferingDate: string;
  offeringQuarterLabel: string;
  birthdayMonth: string;
  birthdayNames: string;
  showPreServiceChairName: boolean;
  preServiceChairNames: string;
  staffMeetingDate: string;
  testimonyShareDate: string;
  serviceRosterText: string;
  baptismText: string;
  scriptureBook: string;
  scriptureReference: string;
  verseOfWeek: string;
  weeklyMeetingVariant: number | null;
  skipTestimonyWeek: boolean;
  skipDepartmentReports: boolean;
  hiddenSections: string[];
  slideTextOverrides: { slide: number; textIndex: number; text: string }[];
  worshipLyricsPptxBlobId: string | null;
  outputBlobId: string | null;
}>;

type AnnouncementInput = {
  category?: string;
  title?: string;
  body: string;
};

const BULLETIN_PLAYLIST_SOURCE = 'bulletin://service-playlist';

async function ensureBulletinServicePlaylist(
  db: Db,
  bulletin: typeof weeklyBulletins.$inferSelect,
  userId: string,
) {
  if (bulletin.servicePlaylistId) {
    const [existing] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, bulletin.servicePlaylistId));
    if (existing) return existing;
  }

  const title = `${bulletin.serviceDate} 敬拜赞美`;
  const now = new Date();
  const [playlist] = await db
    .insert(playlists)
    .values({
      title,
      sourceUrl: `${BULLETIN_PLAYLIST_SOURCE}/${bulletin.id}`,
      createdByUserId: userId,
      updatedAt: now,
    })
    .returning();

  await db
    .update(weeklyBulletins)
    .set({ servicePlaylistId: playlist!.id, updatedAt: now })
    .where(eq(weeklyBulletins.id, bulletin.id));

  return playlist!;
}

function buildWorshipInviteUrl(webAppUrl: string, token: string): string {
  return `${webAppUrl}/#/worship-songs?invite=${encodeURIComponent(token)}`;
}

export function registerBulletinRoutes(
  app: FastifyInstance,
  {
    db,
    redisUrl,
    sofficePath,
    sofficePreviewUrl,
    env,
    audioQueue,
  }: {
    db: Db;
    redisUrl: string;
    sofficePath: string;
    sofficePreviewUrl?: string;
    env: ApiEnv;
    audioQueue: Queue;
  },
) {
  void purgeExpiredScripturePreferences(db).catch((err) =>
    app.log.error(err, 'scripture preference purge failed'),
  );
  setInterval(() => {
    void purgeExpiredScripturePreferences(db).catch((err) =>
      app.log.error(err, 'scripture preference purge failed'),
    );
  }, 24 * 60 * 60 * 1000);

  app.get('/v1/bulletins/template/slides', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const raw = await readFile(join(BULLETIN_TEMPLATE_DIR, 'template-slide-map.json'), 'utf8');
    return reply.send(JSON.parse(raw));
  });

  app.get('/v1/bulletins/template/file', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const buf = await readFile(join(BULLETIN_TEMPLATE_DIR, BULLETIN_TEMPLATE_FILE));
    return reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      )
      .header('Content-Disposition', `attachment; filename="${BULLETIN_TEMPLATE_FILE}"`)
      .send(buf);
  });

  app.get<{
    Params: { slide: string };
  }>('/v1/bulletins/template/slides/:slide/text-runs', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const slideNumber = Number.parseInt(request.params.slide, 10);
    if (!Number.isFinite(slideNumber) || slideNumber < 1) {
      return reply.code(400).send({ error: 'invalid_slide' });
    }
    try {
      const templateBuf = await readFile(join(BULLETIN_TEMPLATE_DIR, BULLETIN_TEMPLATE_FILE));
      const runs = await extractIndexedTextRunsFromPptx(templateBuf, slideNumber);
      return reply.send({
        slide: slideNumber,
        runs: runs.filter((r) => r.text.trim().length > 0),
      });
    } catch (err) {
      request.log.warn({ err, slideNumber }, 'bulletin slide text-runs failed');
      return reply.code(503).send({ error: 'slide_text_runs_unavailable' });
    }
  });

  app.get<{
    Querystring: {
      scriptureBook?: string;
      scriptureReference?: string;
    };
  }>('/v1/bulletins/scripture-bodies', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const scriptureBook = request.query.scriptureBook?.trim() ?? '';
    const scriptureReference = request.query.scriptureReference?.trim() ?? '';
    if (!scriptureBook || !scriptureReference) {
      return reply.code(400).send({ error: 'scripture_required' });
    }

    try {
      const bodies = await resolveScriptureSlideBodies(scriptureBook, scriptureReference);
      if (!bodies) return reply.code(404).send({ error: 'scripture_not_found' });
      return reply.send(bodies);
    } catch (err) {
      request.log.warn({ err, scriptureBook, scriptureReference }, 'scripture bodies failed');
      return reply.code(503).send({ error: 'scripture_data_unavailable' });
    }
  });

  app.get<{
    Querystring: { bulletinId?: string };
  }>('/v1/bulletins/scripture-preference', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const bulletinId = request.query.bulletinId?.trim();
    if (!bulletinId) {
      return reply.code(400).send({ error: 'bulletin_id_required' });
    }
    try {
      const preference = await getScripturePreference(db, user.id, bulletinId);
      if (!preference) return reply.code(404).send({ error: 'not_found' });
      return reply.send({ preference });
    } catch (err) {
      request.log.error(err, 'get scripture preference failed');
      return reply.code(500).send({ error: 'bulletin_db_error' });
    }
  });

  app.put<{
    Body: {
      bulletinId?: string;
      scriptureBook?: string;
      scriptureReference?: string;
    };
  }>('/v1/bulletins/scripture-preference', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canManageBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const bulletinId = request.body?.bulletinId?.trim();
    const scriptureBook = request.body?.scriptureBook?.trim() ?? '';
    const scriptureReference = request.body?.scriptureReference?.trim() ?? '';
    if (!bulletinId) {
      return reply.code(400).send({ error: 'bulletin_id_required' });
    }
    const [bulletin] = await db
      .select({ id: weeklyBulletins.id })
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, bulletinId));
    if (!bulletin) return reply.code(404).send({ error: 'not_found' });

    try {
      const preference = await upsertScripturePreference(db, {
        userId: user.id,
        bulletinId,
        scriptureBook,
        scriptureReference,
      });
      if (scriptureBook || scriptureReference) {
        await db
          .update(weeklyBulletins)
          .set({
            scriptureBook,
            scriptureReference,
            updatedAt: new Date(),
          })
          .where(eq(weeklyBulletins.id, bulletinId));
        const updatedAt = preference.updatedAt;
        void notifyBulletinUpdated(redisUrl, bulletinId, updatedAt).catch((err) => {
          app.log.warn({ err, bulletinId }, 'bulletin realtime notify failed');
        });
      }
      return reply.send({ preference });
    } catch (err) {
      request.log.error(err, 'upsert scripture preference failed');
      return reply.code(500).send({ error: 'bulletin_db_error' });
    }
  });

  app.get<{
    Querystring: {
      serviceDate?: string;
      serviceTime?: string;
      scriptureBook?: string;
      scriptureReference?: string;
      showPreServiceChairName?: string;
      preServiceChairNames?: string;
      hiddenSections?: string;
      weeklyMeetingVariant?: string;
      birthdayMonth?: string;
      birthdayNames?: string;
      verseOfWeek?: string;
      bulletinId?: string;
      slideTextOverrides?: string;
    };
  }>('/v1/bulletins/template/deck-plan', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const q = parsePreviewQuery(request.query);
    if (q.serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(q.serviceDate)) {
      return reply.code(400).send({ error: 'invalid_service_date' });
    }

    const bulletinId = request.query.bulletinId?.trim() || '';
    let slideTextOverrides: SlideTextOverride[] = [];
    const overridesRaw = request.query.slideTextOverrides?.trim();
    if (overridesRaw) {
      try {
        slideTextOverrides = normalizeSlideTextOverrides(JSON.parse(overridesRaw));
      } catch {
        slideTextOverrides = [];
      }
    } else if (bulletinId) {
      const [row] = await db
        .select({ slideTextOverrides: weeklyBulletins.slideTextOverrides })
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, bulletinId))
        .limit(1);
      slideTextOverrides = normalizeSlideTextOverrides(row?.slideTextOverrides);
    }

    const overridesKey = slideOverridesCacheKey(slideTextOverrides);
    const patchKey = `${SLIDE_PREVIEW_PATCH_REV}:pptx:${previewPatchCacheSuffix(q, overridesKey)}`;

    try {
      let pptxBuf = patchedPptxCache.get(patchKey);
      if (!pptxBuf) {
        const templateBuf = await readFile(join(BULLETIN_TEMPLATE_DIR, BULLETIN_TEMPLATE_FILE));
        pptxBuf = Buffer.from(
          await patchBulletinPreviewInPptx(templateBuf, {
            serviceDate: q.serviceDate,
            serviceTime: q.serviceTime,
            scriptureBook: q.scriptureBook,
            scriptureReference: q.scriptureReference,
            showPreServiceChairName: q.showPreServiceChairName,
            preServiceChairNames: q.preServiceChairNames,
            birthdayMonth: q.birthdayMonth,
            birthdayNames: q.birthdayNames,
            verseOfWeek: q.verseOfWeek,
            hiddenSections: q.hiddenSections,
            weeklyMeetingVariant: q.weeklyMeetingVariant,
            slideTextOverrides,
          }),
        );
        rememberLru(patchedPptxCache, patchKey, pptxBuf, 12);
      }

      const plan = await buildBulletinDeckPlanFromPptxBytes(pptxBuf);
      return reply.send({
        rev: SLIDE_PREVIEW_PATCH_REV,
        totalSlides: plan.totalSlides,
        slides: plan.slides,
        sections: plan.sections,
      });
    } catch (err) {
      request.log.warn({ err }, 'bulletin deck-plan failed');
      return reply.code(503).send({ error: 'deck_plan_unavailable' });
    }
  });

  app.get<{
    Params: { slide: string };
    Querystring: {
      serviceDate?: string;
      serviceTime?: string;
      scriptureBook?: string;
      scriptureReference?: string;
      showPreServiceChairName?: string;
      preServiceChairNames?: string;
      hiddenSections?: string;
      weeklyMeetingVariant?: string;
      birthdayMonth?: string;
      birthdayNames?: string;
      verseOfWeek?: string;
      bulletinId?: string;
      slideTextOverrides?: string;
    };
  }>('/v1/bulletins/template/slides/:slide/preview.png', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const slideNumber = Number.parseInt(request.params.slide, 10);
    if (!Number.isFinite(slideNumber) || slideNumber < 1) {
      return reply.code(400).send({ error: 'invalid_slide' });
    }

    const q = parsePreviewQuery(request.query);
    if (q.serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(q.serviceDate)) {
      return reply.code(400).send({ error: 'invalid_service_date' });
    }

    const bulletinId = request.query.bulletinId?.trim() || '';
    let slideTextOverrides: SlideTextOverride[] = [];
    const overridesRaw = request.query.slideTextOverrides?.trim();
    if (overridesRaw) {
      try {
        slideTextOverrides = normalizeSlideTextOverrides(JSON.parse(overridesRaw));
      } catch {
        slideTextOverrides = [];
      }
    } else if (bulletinId) {
      const [row] = await db
        .select({ slideTextOverrides: weeklyBulletins.slideTextOverrides })
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, bulletinId))
        .limit(1);
      slideTextOverrides = normalizeSlideTextOverrides(row?.slideTextOverrides);
    }

    const overridesKey = slideOverridesCacheKey(slideTextOverrides);
    const cacheKey = `${SLIDE_PREVIEW_PATCH_REV}:${slideNumber}:${previewPatchCacheSuffix(q, overridesKey)}`;
    const cached = slidePreviewCache.get(cacheKey);
    if (cached) {
      return reply.header('Content-Type', 'image/png').header('X-Preview-Cached', 'true').send(cached);
    }

    const patchKey = `${SLIDE_PREVIEW_PATCH_REV}:pptx:${previewPatchCacheSuffix(q, overridesKey)}`;
    const workRoot = await mkdtemp(join(tmpdir(), 'fs-bulletin-preview-'));
    try {
      let pptxBuf = patchedPptxCache.get(patchKey);
      if (!pptxBuf) {
        const templateBuf = await readFile(join(BULLETIN_TEMPLATE_DIR, BULLETIN_TEMPLATE_FILE));
        pptxBuf = Buffer.from(
          await patchBulletinPreviewInPptx(templateBuf, {
            serviceDate: q.serviceDate,
            serviceTime: q.serviceTime,
            scriptureBook: q.scriptureBook,
            scriptureReference: q.scriptureReference,
            showPreServiceChairName: q.showPreServiceChairName,
            preServiceChairNames: q.preServiceChairNames,
            birthdayMonth: q.birthdayMonth,
            birthdayNames: q.birthdayNames,
            verseOfWeek: q.verseOfWeek,
            hiddenSections: q.hiddenSections,
            weeklyMeetingVariant: q.weeklyMeetingVariant,
            slideTextOverrides,
          }),
        );
        rememberLru(patchedPptxCache, patchKey, pptxBuf, 12);
      }

      const pptxPath = join(workRoot, 'preview.pptx');
      // 按演示顺序抽出目标页，始终渲染第 1 页，避免 LO/PDF 在加页后按文件号错位
      const singleSlidePptx = Buffer.from(
        await extractPresentationSlideAsPptx(pptxBuf, slideNumber),
      );
      await writeFile(pptxPath, singleSlidePptx);

      const pngBuf = await withPreviewRenderSlot(async () =>
        sofficePreviewUrl
          ? await renderSlidePngViaService(sofficePreviewUrl, singleSlidePptx, 1, {
              timeoutMs: 90_000,
              retries: 2,
            })
          : await (async () => {
              const pngPath = await exportPptxSlidePng({
                sofficePath,
                inputPath: pptxPath,
                outDir: workRoot,
                slideNumber: 1,
              });
              return readFile(pngPath);
            })(),
      );
      rememberLru(slidePreviewCache, cacheKey, pngBuf, 120);
      return reply.header('Content-Type', 'image/png').header('X-Preview-Cached', 'false').send(pngBuf);
    } catch (err) {
      request.log.warn({ err, slideNumber }, 'bulletin slide preview failed');
      return reply.code(503).send({ error: 'slide_preview_unavailable' });
    } finally {
      await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  app.get('/v1/bulletins', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    try {
      const rows = await db
        .select()
        .from(weeklyBulletins)
        .orderBy(desc(weeklyBulletins.serviceDate))
        .limit(24);
      const bulletins = await Promise.all(rows.map((row) => mapBulletin(db, row)));
      return reply.send({ bulletins });
    } catch (err) {
      request.log.error(err, 'list bulletins failed');
      return reply.code(500).send({ error: 'bulletin_db_error' });
    }
  });

  app.get<{ Params: { id: string } }>('/v1/bulletins/:id', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const [row] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ bulletin: await mapBulletin(db, row) });
  });

  app.post<{ Body: { serviceDate?: string } }>('/v1/bulletins', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canManageBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const serviceDate = request.body?.serviceDate?.trim();
    if (!serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      return reply.code(400).send({ error: 'invalid_service_date' });
    }
    const [existing] = await db
      .select({ id: weeklyBulletins.id })
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.serviceDate, serviceDate));
    if (existing) {
      return reply.code(409).send({ error: 'bulletin_exists', id: existing.id });
    }
    const [row] = await db
      .insert(weeklyBulletins)
      .values({
        serviceDate,
        createdByUserId: user.id,
      })
      .returning();
    return reply.code(201).send({ bulletin: await mapBulletin(db, row!) });
  });

  app.patch<{ Params: { id: string }; Body: BulletinPatchBody }>(
    '/v1/bulletins/:id',
    async (request, reply) => {
      const user = requireUser(request);
      if (!user || !canManageBulletin(user.role)) {
        return reply.code(403).send({ error: 'bulletin_forbidden' });
      }
      const [existing] = await db
        .select()
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, request.params.id));
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const body = request.body ?? {};
      const patch: Partial<typeof weeklyBulletins.$inferInsert> = {
        updatedAt: new Date(),
      };
      const assignText = (
        key: keyof BulletinPatchBody,
        column: keyof typeof weeklyBulletins.$inferInsert,
      ) => {
        if (body[key] !== undefined) {
          (patch as Record<string, unknown>)[column] = body[key];
        }
      };
      if (body.serviceDate !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.serviceDate)) {
          return reply.code(400).send({ error: 'invalid_service_date' });
        }
        patch.serviceDate = body.serviceDate;
      }
      assignText('serviceTime', 'serviceTime');
      assignText('status', 'status');
      assignText('lastWeekOfferingDate', 'lastWeekOfferingDate');
      assignText('offeringQuarterLabel', 'offeringQuarterLabel');
      assignText('birthdayMonth', 'birthdayMonth');
      assignText('birthdayNames', 'birthdayNames');
      if (body.showPreServiceChairName !== undefined) {
        patch.showPreServiceChairName = body.showPreServiceChairName;
      }
      assignText('preServiceChairNames', 'preServiceChairNames');
      assignText('staffMeetingDate', 'staffMeetingDate');
      assignText('testimonyShareDate', 'testimonyShareDate');
      assignText('serviceRosterText', 'serviceRosterText');
      assignText('baptismText', 'baptismText');
      assignText('scriptureBook', 'scriptureBook');
      assignText('scriptureReference', 'scriptureReference');
      assignText('verseOfWeek', 'verseOfWeek');
      if (body.weeklyMeetingVariant !== undefined) {
        const v = body.weeklyMeetingVariant;
        if (v !== null && v !== 28 && v !== 29 && v !== 30) {
          return reply.code(400).send({ error: 'invalid_meeting_variant' });
        }
        patch.weeklyMeetingVariant = v;
      }
      if (body.skipTestimonyWeek !== undefined) patch.skipTestimonyWeek = body.skipTestimonyWeek;
      if (body.skipDepartmentReports !== undefined) {
        patch.skipDepartmentReports = body.skipDepartmentReports;
      }
      if (body.hiddenSections !== undefined) {
        const hidden = normalizeHiddenSections(body.hiddenSections);
        patch.hiddenSections = hidden;
        patch.skipTestimonyWeek = hidden.includes('testimony_week');
        patch.skipDepartmentReports = hidden.includes('department_reports');
      }
      if (body.slideTextOverrides !== undefined) {
        patch.slideTextOverrides = normalizeSlideTextOverrides(body.slideTextOverrides);
      }
      if (body.outputBlobId !== undefined) {
        if (body.outputBlobId === null) {
          patch.outputBlobId = null;
        } else {
          const [blob] = await db
            .select({ id: blobs.id })
            .from(blobs)
            .where(eq(blobs.id, body.outputBlobId));
          if (!blob) {
            return reply.code(400).send({ error: 'invalid_blob_id' });
          }
          patch.outputBlobId = body.outputBlobId;
        }
      }
      if (body.worshipLyricsPptxBlobId !== undefined) {
        if (body.worshipLyricsPptxBlobId === null) {
          patch.worshipLyricsPptxBlobId = null;
        } else {
          const [blob] = await db
            .select({ id: blobs.id })
            .from(blobs)
            .where(eq(blobs.id, body.worshipLyricsPptxBlobId));
          if (!blob) {
            return reply.code(400).send({ error: 'invalid_blob_id' });
          }
          patch.worshipLyricsPptxBlobId = body.worshipLyricsPptxBlobId;
        }
      }

      const [row] = await db
        .update(weeklyBulletins)
        .set(patch)
        .where(eq(weeklyBulletins.id, request.params.id))
        .returning();
      const updatedAt = row!.updatedAt ?? new Date();
      void notifyBulletinUpdated(redisUrl, request.params.id, updatedAt).catch((err) => {
        app.log.error(err, 'bulletin realtime notify failed');
      });
      return reply.send({ bulletin: await mapBulletin(db, row!) });
    },
  );

  app.put<{ Params: { id: string }; Body: { announcements?: AnnouncementInput[] } }>(
    '/v1/bulletins/:id/announcements',
    async (request, reply) => {
      const user = requireUser(request);
      if (!user || !canManageBulletin(user.role)) {
        return reply.code(403).send({ error: 'bulletin_forbidden' });
      }
      const [existing] = await db
        .select({ id: weeklyBulletins.id })
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, request.params.id));
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const items = request.body?.announcements ?? [];
      if (!Array.isArray(items)) {
        return reply.code(400).send({ error: 'invalid_announcements' });
      }

      await db
        .delete(bulletinAnnouncements)
        .where(eq(bulletinAnnouncements.bulletinId, request.params.id));

      if (items.length) {
        await db.insert(bulletinAnnouncements).values(
          items.map((item, index) => ({
            bulletinId: request.params.id,
            sortOrder: index,
            category: (item.category ?? 'general').trim() || 'general',
            title: (item.title ?? '').trim(),
            body: item.body.trim(),
          })),
        );
      }

      const touchedAt = new Date();
      await db
        .update(weeklyBulletins)
        .set({ updatedAt: touchedAt })
        .where(eq(weeklyBulletins.id, request.params.id));

      const [row] = await db
        .select()
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, request.params.id));
      const updatedAt = row!.updatedAt ?? touchedAt;
      void notifyBulletinUpdated(redisUrl, request.params.id, updatedAt).catch((err) => {
        app.log.error(err, 'bulletin realtime notify failed');
      });
      return reply.send({ bulletin: await mapBulletin(db, row!) });
    },
  );

  app.post<{ Params: { id: string } }>('/v1/bulletins/:id/worship-playlist', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canManageBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const [bulletin] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, request.params.id));
    if (!bulletin) return reply.code(404).send({ error: 'not_found' });

    const playlist = await ensureBulletinServicePlaylist(db, bulletin, user.id);
    const [updated] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, bulletin.id));

    const expiresAtUnix = Math.floor(Date.now() / 1000) + env.SHARE_LINK_TTL_SECONDS;
    const inviteToken = signPlaylistEditToken({
      secret: env.DOWNLOAD_HMAC_SECRET,
      playlistId: playlist.id,
      bulletinId: bulletin.id,
      expiresAtUnix,
    });
    const webAppUrl = resolveWebAppUrl(env);

    return reply.send({
      bulletin: await mapBulletin(db, updated!),
      playlist: {
        id: playlist.id,
        title: playlist.title,
      },
      inviteToken,
      inviteUrl: buildWorshipInviteUrl(webAppUrl, inviteToken),
      expiresAtUnix,
    });
  });

  app.post<{
    Params: { id: string };
    Body: { email?: string; message?: string };
  }>('/v1/bulletins/:id/worship-playlist/invite', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canManageBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const [bulletin] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, request.params.id));
    if (!bulletin) return reply.code(404).send({ error: 'not_found' });

    const playlist = await ensureBulletinServicePlaylist(db, bulletin, user.id);
    const expiresAtUnix = Math.floor(Date.now() / 1000) + env.SHARE_LINK_TTL_SECONDS;
    const inviteToken = signPlaylistEditToken({
      secret: env.DOWNLOAD_HMAC_SECRET,
      playlistId: playlist.id,
      bulletinId: bulletin.id,
      expiresAtUnix,
    });
    const webAppUrl = resolveWebAppUrl(env);
    const inviteUrl = buildWorshipInviteUrl(webAppUrl, inviteToken);

    const recipientEmail = request.body?.email?.trim().toLowerCase();
    if (recipientEmail) {
      const mailConfig = resolveMailConfig(env);
      if (!mailConfig) {
        return reply.code(503).send({ error: 'email_not_configured' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return reply.code(400).send({ error: 'invalid_email' });
      }

      const senderName = formatUserDisplayName(user) || user.email;
      const optionalMessage = request.body?.message?.trim();
      const subject = `${senderName} 邀请你填写 ${bulletin.serviceDate} 敬拜歌单`;
      const textLines = [
        `${senderName} 邀请你为 ${bulletin.serviceDate} 主日崇拜填写敬拜歌单「${playlist.title}」。`,
        optionalMessage ? `\n附言：${optionalMessage}\n` : '',
        '你可以从 YouTube 播放列表导入，或逐首粘贴 YouTube 链接添加：',
        inviteUrl,
        '',
        `链接 ${Math.ceil(env.SHARE_LINK_TTL_SECONDS / 86_400)} 天内有效。`,
      ].filter((line) => line !== '');

      try {
        await sendMail({
          config: mailConfig,
          to: recipientEmail,
          subject,
          text: textLines.join('\n'),
          html: [
            `<p><strong>${senderName}</strong> 邀请你为 <strong>${bulletin.serviceDate}</strong> 主日崇拜填写敬拜歌单「${playlist.title}」。</p>`,
            optionalMessage
              ? `<p><strong>附言：</strong>${optionalMessage.replace(/</g, '&lt;')}</p>`
              : '',
            '<p>你可以从 YouTube 播放列表导入，或逐首粘贴 YouTube 链接添加。</p>',
            `<p><a href="${inviteUrl.replace(/"/g, '&quot;')}">打开链接编辑歌单</a></p>`,
            `<p style="color:#666;font-size:13px;">链接 ${Math.ceil(env.SHARE_LINK_TTL_SECONDS / 86_400)} 天内有效。</p>`,
          ]
            .filter(Boolean)
            .join(''),
        });
      } catch (e) {
        request.log.error(e, 'worship playlist invite email failed');
        return reply.code(502).send({ error: 'email_send_failed' });
      }
    }

    const [updated] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, bulletin.id));

    return reply.send({
      bulletin: await mapBulletin(db, updated!),
      playlist: {
        id: playlist.id,
        title: playlist.title,
      },
      inviteToken,
      inviteUrl,
      expiresAtUnix,
      emailed: Boolean(recipientEmail),
    });
  });

  app.get<{ Params: { id: string } }>('/v1/bulletins/:id/worship-playlist', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const [bulletin] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, request.params.id));
    if (!bulletin) return reply.code(404).send({ error: 'not_found' });

    if (!bulletin.servicePlaylistId) {
      return reply.send({
        bulletin: await mapBulletin(db, bulletin),
        playlist: null,
        items: [],
        canEdit: canEditBulletinWorshipSongs(user.role),
      });
    }

    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, bulletin.servicePlaylistId));
    if (!playlist) {
      return reply.send({
        bulletin: await mapBulletin(db, bulletin),
        playlist: null,
        items: [],
        canEdit: canEditBulletinWorshipSongs(user.role),
      });
    }

    const detail = await buildPlaylistDetail(db, playlist, audioQueue);
    return reply.send({
      ...detail,
      bulletin: {
        id: bulletin.id,
        serviceDate: bulletin.serviceDate,
        serviceTime: bulletin.serviceTime,
      },
      canEdit: canEditBulletinWorshipSongs(user.role),
    });
  });

  app.post<{ Params: { id: string } }>('/v1/bulletins/:id/worship-playlist/open', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canEditBulletinWorshipSongs(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const [bulletin] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, request.params.id));
    if (!bulletin) return reply.code(404).send({ error: 'not_found' });

    const playlist = await ensureBulletinServicePlaylist(db, bulletin, bulletin.createdByUserId);
    const detail = await buildPlaylistDetail(db, playlist, audioQueue);
    return reply.send({
      ...detail,
      bulletin: {
        id: bulletin.id,
        serviceDate: bulletin.serviceDate,
        serviceTime: bulletin.serviceTime,
      },
      canEdit: true,
    });
  });

  app.post<{
    Params: { id: string };
    Body: { url?: string; items?: { videoId?: string; title?: string }[] };
  }>('/v1/bulletins/:id/worship-playlist/items', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canEditBulletinWorshipSongs(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const [bulletin] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, request.params.id));
    if (!bulletin) return reply.code(404).send({ error: 'not_found' });

    const playlist = await ensureBulletinServicePlaylist(db, bulletin, bulletin.createdByUserId);
    const playlistId = playlist.id;

    const bodyItems = request.body?.items;
    if (Array.isArray(bodyItems) && bodyItems.length > 0) {
      const videos = bodyItems
        .map((row) => ({
          videoId: row.videoId?.trim() ?? '',
          title: row.title?.trim() ?? '',
        }))
        .filter((row) => row.videoId && row.title);
      if (!videos.length) return reply.code(400).send({ error: 'invalid_request' });

      const result = await appendVideosToPlaylist(db, playlistId, videos, audioQueue);
      if (!result.addedCount) {
        return reply.code(409).send({
          error: 'playlist_items_duplicate',
          skipped: result.skippedCount,
        });
      }
      return { ...result.detail, addedCount: result.addedCount, skippedCount: result.skippedCount };
    }

    const url = request.body?.url?.trim();
    if (!url) return reply.code(400).send({ error: 'url_required' });

    let imported;
    try {
      imported = await fetchYoutubePlaylistData(url, env.YOUTUBE_API_KEY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'youtube_import_failed';
      if (msg === 'invalid_youtube_url') {
        return reply.code(400).send({ error: 'invalid_youtube_url' });
      }
      request.log.error(e, 'bulletin worship add items failed');
      return reply.code(502).send({ error: 'youtube_import_failed' });
    }

    if (!imported.items.length) {
      return reply.code(400).send({ error: 'youtube_playlist_empty' });
    }

    const result = await appendVideosToPlaylist(
      db,
      playlistId,
      imported.items.map((video) => ({ videoId: video.videoId, title: video.title })),
      audioQueue,
    );
    if (!result.addedCount) {
      return reply.code(409).send({
        error: 'playlist_items_duplicate',
        skipped: result.skippedCount,
      });
    }
    return { ...result.detail, addedCount: result.addedCount, skippedCount: result.skippedCount };
  });

  app.post<{
    Params: { id: string };
    Body: { youtubePlaylistId?: string };
  }>('/v1/bulletins/:id/worship-playlist/import-youtube', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canEditBulletinWorshipSongs(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }

    const youtubePlaylistId = request.body?.youtubePlaylistId?.trim();
    if (!youtubePlaylistId) return reply.code(400).send({ error: 'invalid_request' });

    const oauth = resolveOAuthConfig(env);
    if (!oauth) return reply.code(503).send({ error: 'youtube_oauth_not_configured' });

    const tokenResult = await getValidYoutubeAccessToken(db, oauth, user.id);
    if ('error' in tokenResult) {
      const code = tokenResult.error === 'not_connected' ? 'youtube_not_connected' : 'youtube_token_refresh_failed';
      return reply.code(tokenResult.error === 'not_connected' ? 400 : 502).send({ error: code });
    }

    const [bulletin] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, request.params.id));
    if (!bulletin) return reply.code(404).send({ error: 'not_found' });

    let videos;
    try {
      videos = await fetchOauthYoutubePlaylistItems(tokenResult.accessToken, youtubePlaylistId);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'youtube_import_failed';
      request.log.error(e, 'bulletin worship oauth import failed');
      const code = mapYoutubeApiError(raw);
      const status =
        code === 'youtube_quota_exceeded'
          ? 429
          : code === 'youtube_api_not_enabled' || code === 'youtube_channel_required'
            ? 503
            : 502;
      return reply.code(status).send({ error: code });
    }

    if (!videos.length) {
      return reply.code(400).send({ error: 'youtube_playlist_empty' });
    }

    const playlist = await ensureBulletinServicePlaylist(db, bulletin, bulletin.createdByUserId);
    const result = await appendVideosToPlaylist(db, playlist.id, videos, audioQueue);
    if (!result.addedCount) {
      return reply.code(409).send({
        error: 'playlist_items_duplicate',
        skipped: result.skippedCount,
      });
    }
    return { ...result.detail, addedCount: result.addedCount, skippedCount: result.skippedCount };
  });

  app.put<{ Params: { id: string }; Body: { itemIds?: string[] } }>(
    '/v1/bulletins/:id/worship-playlist/items/order',
    async (request, reply) => {
      const user = requireUser(request);
      if (!user || !canEditBulletinWorshipSongs(user.role)) {
        return reply.code(403).send({ error: 'bulletin_forbidden' });
      }

      const [bulletin] = await db
        .select()
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, request.params.id));
      if (!bulletin?.servicePlaylistId) return reply.code(404).send({ error: 'not_found' });

      const itemIds = request.body?.itemIds;
      if (!Array.isArray(itemIds) || !itemIds.length) {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      const playlistId = bulletin.servicePlaylistId;
      const items = await db
        .select()
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, playlistId));
      const itemMap = new Map(items.map((item) => [item.id, item]));
      if (itemIds.some((id) => !itemMap.has(id))) {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      await Promise.all(
        itemIds.map((id, index) =>
          db
            .update(playlistItems)
            .set({ sortOrder: index })
            .where(and(eq(playlistItems.id, id), eq(playlistItems.playlistId, playlistId))),
        ),
      );
      await db
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, playlistId));

      const [updated] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
      return buildPlaylistDetail(db, updated!, audioQueue);
    },
  );

  app.delete<{ Params: { id: string; itemId: string } }>(
    '/v1/bulletins/:id/worship-playlist/items/:itemId',
    async (request, reply) => {
      const user = requireUser(request);
      if (!user || !canEditBulletinWorshipSongs(user.role)) {
        return reply.code(403).send({ error: 'bulletin_forbidden' });
      }

      const [bulletin] = await db
        .select()
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, request.params.id));
      if (!bulletin?.servicePlaylistId) return reply.code(404).send({ error: 'not_found' });

      const playlistId = bulletin.servicePlaylistId;
      const { itemId } = request.params;
      const [deleted] = await db
        .delete(playlistItems)
        .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)))
        .returning();

      if (!deleted) return reply.code(404).send({ error: 'not_found' });

      await db
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, playlistId));

      return { ok: true };
    },
  );
}
