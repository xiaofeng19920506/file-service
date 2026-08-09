/**
 * 牧师分区邀请（主日信息 PPT / 本週金句）：
 * - 令牌很长且含多个 `.`，Fastify `:param` 会匹配失败 → 走 `/*`
 * - 内容持久化在周报上；同一未过期链接可反复打开查看并修改
 * - 邀请页可预览已上传 PPT 各页 / 金句投影页
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import {
  blobs,
  extractPresentationSlideAsPptx,
  exportPptxSlidePng,
  listPptxSlidesInPresentationOrder,
  normalizeSectionPptxOverrides,
  patchBulletinPreviewInPptx,
  pptxBufferSlidesAreWellFormed,
  renderSlidePngViaService,
  setSectionPptxOverride,
  verifyBulletinSectionInviteToken,
  weeklyBulletins,
  type ApiEnv,
  type Db,
  type ObjectStorage,
} from '@file-service/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { persistBlobFromBuffer } from './blob-store.js';
import {
  readBulletinPreviewDiskCache,
  writeBulletinPreviewDiskCache,
} from './bulletin-preview-disk-cache.js';
import { notifyBulletinUpdated } from './bulletin-realtime.js';
import { parseBulletinSectionInviteRest } from './bulletin-section-invite-path.js';
import { readMultipartFileBuffer } from './multipart-read.js';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** 模板中「本週金句」页（无公告加页时的演示序号） */
const VERSE_OF_WEEK_SLIDE = 35;

const INVITE_PREVIEW_REV = 'invite-preview-v1';
const invitePreviewCache = new Map<string, Buffer>();

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

let previewRenderActive = 0;
const previewRenderWaiters: Array<() => void> = [];
const PREVIEW_RENDER_MAX = 4;

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

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readBlobBuffer(storage: ObjectStorage, storageKey: string): Promise<Buffer> {
  const stream = await storage.createReadStream(storageKey);
  return streamToBuffer(stream);
}

function inviteError(reply: FastifyReply, error: 'invalid_invite_token' | 'not_found') {
  if (error === 'invalid_invite_token') {
    return reply.code(400).send({ error: 'invalid_invite_token' });
  }
  return reply.code(404).send({ error: 'not_found' });
}

async function resolveSectionInvite(
  db: Db,
  secret: string,
  token: string,
): Promise<
  | { error: 'invalid_invite_token' | 'not_found' }
  | {
      bulletin: typeof weeklyBulletins.$inferSelect;
      sectionId: string;
      expiresAtUnix: number;
    }
> {
  const claims = verifyBulletinSectionInviteToken({ secret, token });
  if (!claims) return { error: 'invalid_invite_token' };

  const [bulletin] = await db
    .select()
    .from(weeklyBulletins)
    .where(eq(weeklyBulletins.id, claims.bulletinId));
  if (!bulletin) return { error: 'not_found' };

  return {
    bulletin,
    sectionId: claims.sectionId,
    expiresAtUnix: claims.expiresAtUnix,
  };
}

function isPptxFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.pptx') || lower.endsWith('.ppt');
}

async function loadOverrideBlobMeta(
  db: Db,
  bulletin: typeof weeklyBulletins.$inferSelect,
  sectionId: string,
): Promise<{
  hasPptxOverride: boolean;
  pptxBlobId: string | null;
  pptxFileName: string | null;
  pptxUploadedAt: string | null;
}> {
  const overrides = normalizeSectionPptxOverrides(bulletin.sectionPptxOverrides);
  const blobId = overrides[sectionId] ?? null;
  if (!blobId) {
    return {
      hasPptxOverride: false,
      pptxBlobId: null,
      pptxFileName: null,
      pptxUploadedAt: null,
    };
  }
  const [blob] = await db
    .select({
      id: blobs.id,
      originalFilename: blobs.originalFilename,
      title: blobs.title,
      createdAt: blobs.createdAt,
    })
    .from(blobs)
    .where(eq(blobs.id, blobId))
    .limit(1);
  if (!blob) {
    return {
      hasPptxOverride: false,
      pptxBlobId: null,
      pptxFileName: null,
      pptxUploadedAt: null,
    };
  }
  return {
    hasPptxOverride: true,
    pptxBlobId: blob.id,
    pptxFileName: blob.originalFilename || blob.title || 'upload.pptx',
    pptxUploadedAt: blob.createdAt?.toISOString?.() ?? null,
  };
}

async function countPptxSlides(buf: Buffer): Promise<number> {
  const order = await listPptxSlidesInPresentationOrder(buf);
  return order.length;
}

async function renderPptxSlidePng(opts: {
  pptxBuf: Buffer;
  slide: number;
  sofficePath: string;
  sofficePreviewUrl?: string;
}): Promise<Buffer> {
  const { pptxBuf, slide, sofficePath, sofficePreviewUrl } = opts;
  const workRoot = await mkdtemp(join(tmpdir(), 'fs-section-invite-preview-'));
  try {
    const singleSlidePptx = Buffer.from(await extractPresentationSlideAsPptx(pptxBuf, slide));
    const pptxPath = join(workRoot, 'preview.pptx');
    await writeFile(pptxPath, singleSlidePptx);
    return await withPreviewRenderSlot(async () =>
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
  } finally {
    await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function registerBulletinSectionInviteRoutes(
  app: FastifyInstance,
  opts: { db: Db; env: ApiEnv; storage: ObjectStorage; redisUrl: string },
) {
  const { db, env, storage, redisUrl } = opts;
  const sofficePath = env.SOFFICE_PATH;
  const sofficePreviewUrl = env.SOFFICE_PREVIEW_URL;

  app.get<{
    Params: { '*': string };
    Querystring: { verseOfWeek?: string };
  }>('/v1/bulletins/section-invite/*', async (request, reply) => {
    const parsed = parseBulletinSectionInviteRest(request.params['*'] ?? '');

    if (parsed.kind === 'pptx') {
      const resolved = await resolveSectionInvite(db, env.DOWNLOAD_HMAC_SECRET, parsed.token);
      if ('error' in resolved) return inviteError(reply, resolved.error);

      const meta = await loadOverrideBlobMeta(db, resolved.bulletin, resolved.sectionId);
      if (!meta.pptxBlobId) return reply.code(404).send({ error: 'not_found' });

      const [blob] = await db.select().from(blobs).where(eq(blobs.id, meta.pptxBlobId)).limit(1);
      if (!blob) return reply.code(404).send({ error: 'not_found' });

      const filename = (meta.pptxFileName || 'upload.pptx').replace(/[\r\n"]/g, '_');
      const stream = await storage.createReadStream(blob.storageKey);
      return reply
        .header('Content-Type', blob.mimeType || PPTX_MIME)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Cache-Control', 'private, no-store')
        .send(stream);
    }

    if (parsed.kind === 'previewSlide') {
      const resolved = await resolveSectionInvite(db, env.DOWNLOAD_HMAC_SECRET, parsed.token);
      if ('error' in resolved) return inviteError(reply, resolved.error);

      try {
        let pptxBuf: Buffer;
        let cacheKey: string;

        if (resolved.sectionId === 'verse_of_week') {
          const verseFromQuery =
            typeof request.query.verseOfWeek === 'string' ? request.query.verseOfWeek : null;
          const verseOfWeek = (verseFromQuery ?? resolved.bulletin.verseOfWeek ?? '').trim();
          const templateBuf = await readFile(join(BULLETIN_TEMPLATE_DIR, BULLETIN_TEMPLATE_FILE));
          pptxBuf = Buffer.from(
            await patchBulletinPreviewInPptx(templateBuf, {
              serviceDate: resolved.bulletin.serviceDate,
              serviceTime: resolved.bulletin.serviceTime || '11:00',
              verseOfWeek,
              retainHiddenSections: true,
            }),
          );
          if (parsed.slide !== 1) {
            return reply.code(400).send({ error: 'invalid_slide' });
          }
          const verseHash = createHash('sha256').update(verseOfWeek).digest('hex').slice(0, 16);
          cacheKey = `${INVITE_PREVIEW_REV}:verse:${resolved.bulletin.id}:${VERSE_OF_WEEK_SLIDE}:${verseHash}`;
          const pngBuf = await (async () => {
            let cached = invitePreviewCache.get(cacheKey);
            if (!cached) {
              const fromDisk = await readBulletinPreviewDiskCache(cacheKey);
              if (fromDisk) {
                cached = fromDisk;
                rememberLru(invitePreviewCache, cacheKey, cached, 64);
              }
            }
            if (cached) return cached;
            const rendered = await renderPptxSlidePng({
              pptxBuf,
              slide: VERSE_OF_WEEK_SLIDE,
              sofficePath,
              sofficePreviewUrl,
            });
            rememberLru(invitePreviewCache, cacheKey, rendered, 64);
            void writeBulletinPreviewDiskCache(cacheKey, rendered);
            return rendered;
          })();
          return reply
            .header('Content-Type', 'image/png')
            .header('Cache-Control', 'private, no-store')
            .send(pngBuf);
        }

        const meta = await loadOverrideBlobMeta(db, resolved.bulletin, resolved.sectionId);
        if (!meta.pptxBlobId) return reply.code(404).send({ error: 'not_found' });
        const [blob] = await db.select().from(blobs).where(eq(blobs.id, meta.pptxBlobId)).limit(1);
        if (!blob) return reply.code(404).send({ error: 'not_found' });
        pptxBuf = await readBlobBuffer(storage, blob.storageKey);
        const slideCount = await countPptxSlides(pptxBuf);
        if (parsed.slide < 1 || parsed.slide > slideCount) {
          return reply.code(400).send({ error: 'invalid_slide' });
        }
        cacheKey = `${INVITE_PREVIEW_REV}:pptx:${meta.pptxBlobId}:${parsed.slide}`;
        let cached = invitePreviewCache.get(cacheKey);
        if (!cached) {
          const fromDisk = await readBulletinPreviewDiskCache(cacheKey);
          if (fromDisk) {
            cached = fromDisk;
            rememberLru(invitePreviewCache, cacheKey, cached, 64);
          }
        }
        if (!cached) {
          cached = await renderPptxSlidePng({
            pptxBuf,
            slide: parsed.slide,
            sofficePath,
            sofficePreviewUrl,
          });
          rememberLru(invitePreviewCache, cacheKey, cached, 64);
          void writeBulletinPreviewDiskCache(cacheKey, cached);
        }
        return reply
          .header('Content-Type', 'image/png')
          .header('Cache-Control', 'private, no-store')
          .send(cached);
      } catch (err) {
        request.log.warn({ err, slide: parsed.slide }, 'section invite slide preview failed');
        return reply.code(503).send({ error: 'slide_preview_unavailable' });
      }
    }

    if (parsed.kind !== 'detail') {
      return reply.code(404).send({ error: 'not_found' });
    }

    const resolved = await resolveSectionInvite(db, env.DOWNLOAD_HMAC_SECRET, parsed.token);
    if ('error' in resolved) return inviteError(reply, resolved.error);

    const pptxMeta = await loadOverrideBlobMeta(db, resolved.bulletin, resolved.sectionId);

    let previewMode: 'none' | 'uploaded_pptx' | 'verse_slide' = 'none';
    let previewSlideCount = 0;
    if (resolved.sectionId === 'verse_of_week') {
      previewMode = 'verse_slide';
      previewSlideCount = 1;
    } else if (pptxMeta.pptxBlobId) {
      try {
        const [blob] = await db
          .select()
          .from(blobs)
          .where(eq(blobs.id, pptxMeta.pptxBlobId))
          .limit(1);
        if (blob) {
          const buf = await readBlobBuffer(storage, blob.storageKey);
          previewSlideCount = await countPptxSlides(buf);
          previewMode = previewSlideCount > 0 ? 'uploaded_pptx' : 'none';
        }
      } catch (err) {
        request.log.warn(err, 'section invite preview slide count failed');
      }
    }

    return {
      bulletinId: resolved.bulletin.id,
      serviceDate: resolved.bulletin.serviceDate,
      serviceTime: resolved.bulletin.serviceTime,
      sectionId: resolved.sectionId,
      hasPptxOverride: pptxMeta.hasPptxOverride,
      pptxBlobId: pptxMeta.pptxBlobId,
      pptxFileName: pptxMeta.pptxFileName,
      pptxUploadedAt: pptxMeta.pptxUploadedAt,
      verseOfWeek:
        resolved.sectionId === 'verse_of_week' ? resolved.bulletin.verseOfWeek ?? '' : undefined,
      previewMode,
      previewSlideCount,
      expiresAtUnix: resolved.expiresAtUnix,
    };
  });

  app.post<{ Params: { '*': string }; Body: { verseOfWeek?: string } }>(
    '/v1/bulletins/section-invite/*',
    async (request, reply) => {
      const parsed = parseBulletinSectionInviteRest(request.params['*'] ?? '');
      if (parsed.kind === 'verse') {
        const resolved = await resolveSectionInvite(db, env.DOWNLOAD_HMAC_SECRET, parsed.token);
        if ('error' in resolved) return inviteError(reply, resolved.error);
        if (resolved.sectionId !== 'verse_of_week') {
          return reply.code(400).send({ error: 'section_invite_not_supported' });
        }

        const verseOfWeek =
          typeof request.body?.verseOfWeek === 'string' ? request.body.verseOfWeek.trim() : '';
        if (!verseOfWeek) {
          return reply.code(400).send({ error: 'verse_required' });
        }

        const updatedAt = new Date();
        await db
          .update(weeklyBulletins)
          .set({
            verseOfWeek,
            updatedAt,
          })
          .where(eq(weeklyBulletins.id, resolved.bulletin.id));

        void notifyBulletinUpdated(redisUrl, resolved.bulletin.id, updatedAt.toISOString()).catch(
          (err) => {
            app.log.error(err, 'bulletin verse invite realtime notify failed');
          },
        );

        return {
          ok: true,
          bulletinId: resolved.bulletin.id,
          sectionId: resolved.sectionId,
          verseOfWeek,
        };
      }

      if (parsed.kind !== 'pptx') {
        return reply.code(404).send({ error: 'not_found' });
      }

      const resolved = await resolveSectionInvite(db, env.DOWNLOAD_HMAC_SECRET, parsed.token);
      if ('error' in resolved) return inviteError(reply, resolved.error);

      const uploaded = await readMultipartFileBuffer(request, 'file');
      if (!uploaded?.buffer.length) {
        return reply.code(400).send({ error: 'missing_file' });
      }
      if (!isPptxFilename(uploaded.filename)) {
        return reply.code(400).send({ error: 'invalid_pptx' });
      }
      if (!(await pptxBufferSlidesAreWellFormed(uploaded.buffer))) {
        return reply.code(400).send({ error: 'invalid_pptx' });
      }

      const downloadName = `周报-${resolved.bulletin.serviceDate}-主日信息.pptx`;
      // 同内容再传（或诗库已有该文件）时复用 blob，避免 content_already_exists → 500
      const persisted = await persistBlobFromBuffer({
        db,
        storage,
        buf: uploaded.buffer,
        mimeType: PPTX_MIME,
        filename: downloadName,
        ext: 'pptx',
        title: `周报主日信息 ${resolved.bulletin.serviceDate}`,
        notes: `bulletin section invite pptx ${resolved.bulletin.id} ${resolved.sectionId}`,
        reuseExisting: true,
      });

      const nextOverrides = setSectionPptxOverride(
        resolved.bulletin.sectionPptxOverrides,
        resolved.sectionId,
        persisted.blobId,
      );
      const updatedAt = new Date();
      await db
        .update(weeklyBulletins)
        .set({
          sectionPptxOverrides: nextOverrides,
          updatedAt,
        })
        .where(eq(weeklyBulletins.id, resolved.bulletin.id));

      void notifyBulletinUpdated(redisUrl, resolved.bulletin.id, updatedAt.toISOString()).catch(
        (err) => {
          app.log.error(err, 'bulletin section invite realtime notify failed');
        },
      );

      return {
        ok: true,
        bulletinId: resolved.bulletin.id,
        sectionId: resolved.sectionId,
        blobId: persisted.blobId,
        fileName: downloadName,
        sectionPptxOverrides: nextOverrides,
      };
    },
  );
}
