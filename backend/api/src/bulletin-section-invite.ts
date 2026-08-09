/**
 * 牧师分区邀请（主日信息 PPT / 本週金句）：
 * - 令牌很长且含多个 `.`，Fastify `:param` 会匹配失败 → 走 `/*`
 * - 内容持久化在周报上；同一未过期链接可反复打开查看并修改
 */
import { eq } from 'drizzle-orm';
import {
  blobs,
  normalizeSectionPptxOverrides,
  pptxBufferSlidesAreWellFormed,
  setSectionPptxOverride,
  verifyBulletinSectionInviteToken,
  weeklyBulletins,
  type ApiEnv,
  type Db,
  type ObjectStorage,
} from '@file-service/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { persistBlobFromBuffer } from './blob-store.js';
import { notifyBulletinUpdated } from './bulletin-realtime.js';
import { parseBulletinSectionInviteRest } from './bulletin-section-invite-path.js';
import { readMultipartFileBuffer } from './multipart-read.js';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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

export function registerBulletinSectionInviteRoutes(
  app: FastifyInstance,
  opts: { db: Db; env: ApiEnv; storage: ObjectStorage; redisUrl: string },
) {
  const { db, env, storage, redisUrl } = opts;

  app.get<{ Params: { '*': string } }>('/v1/bulletins/section-invite/*', async (request, reply) => {
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

    if (parsed.kind !== 'detail') {
      return reply.code(404).send({ error: 'not_found' });
    }

    const resolved = await resolveSectionInvite(db, env.DOWNLOAD_HMAC_SECRET, parsed.token);
    if ('error' in resolved) return inviteError(reply, resolved.error);

    const pptxMeta = await loadOverrideBlobMeta(db, resolved.bulletin, resolved.sectionId);
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
      const persisted = await persistBlobFromBuffer({
        db,
        storage,
        buf: uploaded.buffer,
        mimeType: PPTX_MIME,
        filename: downloadName,
        ext: 'pptx',
        title: `周报主日信息 ${resolved.bulletin.serviceDate}`,
        notes: `bulletin section invite pptx ${resolved.bulletin.id} ${resolved.sectionId}`,
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
