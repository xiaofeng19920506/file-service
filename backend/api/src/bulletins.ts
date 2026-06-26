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
  type ApiEnv,
  type Db,
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
/** 封面补丁版本；变更后自动失效旧 PNG 缓存 */
const SLIDE_PREVIEW_PATCH_REV = 'v19';

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
  servicePlaylistId: string | null;
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
    servicePlaylistId: row.servicePlaylistId,
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
    Params: { slide: string };
    Querystring: {
      serviceDate?: string;
      serviceTime?: string;
      scriptureBook?: string;
      scriptureReference?: string;
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

    const serviceDate = request.query.serviceDate?.trim();
    const serviceTime = request.query.serviceTime?.trim() || '11:00';
    const scriptureBook = request.query.scriptureBook?.trim() ?? '';
    const scriptureReference = request.query.scriptureReference?.trim() ?? '';
    if (serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      return reply.code(400).send({ error: 'invalid_service_date' });
    }

    const cacheKey = `${SLIDE_PREVIEW_PATCH_REV}:${slideNumber}:${serviceDate ?? ''}:${serviceTime}:${scriptureBook}:${scriptureReference}`;
    const cached = slidePreviewCache.get(cacheKey);
    if (cached) {
      return reply.header('Content-Type', 'image/png').header('X-Preview-Cached', 'true').send(cached);
    }

    const workRoot = await mkdtemp(join(tmpdir(), 'fs-bulletin-preview-'));
    try {
      const templateBuf = await readFile(join(BULLETIN_TEMPLATE_DIR, BULLETIN_TEMPLATE_FILE));
      const pptxBuf = Buffer.from(
        await patchBulletinPreviewInPptx(templateBuf, {
          serviceDate,
          serviceTime,
          scriptureBook,
          scriptureReference,
        }),
      );

      const pptxPath = join(workRoot, 'preview.pptx');
      await writeFile(pptxPath, pptxBuf);

      const pngBuf = sofficePreviewUrl
        ? await renderSlidePngViaService(sofficePreviewUrl, pptxBuf, slideNumber)
        : await (async () => {
            const pngPath = await exportPptxSlidePng({
              sofficePath,
              inputPath: pptxPath,
              outDir: workRoot,
              slideNumber,
            });
            return readFile(pngPath);
          })();
      slidePreviewCache.set(cacheKey, pngBuf);
      if (slidePreviewCache.size > 80) {
        const oldest = slidePreviewCache.keys().next().value;
        if (oldest) slidePreviewCache.delete(oldest);
      }
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
