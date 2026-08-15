import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  adminMediaFolderById,
  blobs,
  ensureYoutubeAudioJobs,
  extractYoutubeVideoMp4,
  isValidYoutubeVideoId,
  parseAdminMediaFolderId,
  serializeAudioCache,
  youtubeAudioCache,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import type { ObjectStorage } from '@file-service/shared';

const VIDEO_DOWNLOAD_TIMEOUT_MS = 650_000;

function safeBasename(title: string | undefined, videoId: string): string {
  const raw = (title?.trim() || videoId).replace(/[\r\n"/\\:*?<>|]+/g, '_').slice(0, 120);
  return raw.replace(/\.(mp3|mp4)$/i, '') || videoId;
}

function adminDownloadRoot(env: ApiEnv): string {
  const configured = env.ADMIN_DOWNLOAD_DIR?.trim();
  if (configured) return configured;
  if (env.STORAGE_BACKEND === 'fs') return join(env.LOCAL_STORAGE_DIR, 'downloads');
  return join(tmpdir(), 'file-service-downloads');
}

function adminMediaRoot(env: ApiEnv): string {
  return env.ADMIN_NAS_MEDIA_DIR?.trim() || join(adminDownloadRoot(env), '影视');
}

export function registerAdminDownloadRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: ApiEnv; storage: ObjectStorage; audioQueue: Queue },
): void {
  const { db, env, storage, audioQueue } = deps;
  const audioRoot = adminDownloadRoot(env);
  const mediaRoot = adminMediaRoot(env);

  const saveAudioToNas = async (videoId: string, titleHint?: string) => {
    const [cache] = await db
      .select()
      .from(youtubeAudioCache)
      .where(eq(youtubeAudioCache.youtubeVideoId, videoId));
    if (!cache || cache.status !== 'ready' || !cache.blobId) {
      return null;
    }

    const [blob] = await db.select().from(blobs).where(eq(blobs.id, cache.blobId));
    if (!blob) throw new Error('not_found');

    const filename = `${safeBasename(titleHint || cache.title || blob.originalFilename || undefined, videoId)}.${videoId}.mp3`;
    const dir = join(audioRoot, 'Music');
    await mkdir(dir, { recursive: true });
    const dest = join(dir, filename);
    await storage.copyToFile(blob.storageKey, dest);
    return {
      saved: true as const,
      kind: 'mp3' as const,
      filename,
      nasPath: `data/downloads/Music/${filename}`,
    };
  };

  app.post<{ Params: { videoId: string }; Body: { title?: string } }>(
    '/v1/admin/youtube/videos/:videoId/audio/download',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const saved = await saveAudioToNas(videoId, request.body?.title);
      if (saved) return saved;

      await ensureYoutubeAudioJobs(db, audioQueue, [
        { videoId, title: request.body?.title?.trim() || undefined },
      ]);

      const [updated] = await db
        .select()
        .from(youtubeAudioCache)
        .where(eq(youtubeAudioCache.youtubeVideoId, videoId));

      return reply.code(202).send({
        ready: false,
        status: updated
          ? serializeAudioCache(updated)
          : { videoId, status: 'pending' as const, blobId: null, errorCode: null },
      });
    },
  );

  app.post<{ Params: { videoId: string }; Body: { title?: string; folder?: string } }>(
    '/v1/admin/youtube/videos/:videoId/video/download',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const folderId = parseAdminMediaFolderId(request.body?.folder);
      if (!folderId) {
        return reply.code(400).send({ error: 'invalid_download_folder' });
      }
      const folder = adminMediaFolderById(folderId);

      request.raw.setTimeout(VIDEO_DOWNLOAD_TIMEOUT_MS);
      reply.raw.setTimeout(VIDEO_DOWNLOAD_TIMEOUT_MS);

      let tmpDir: string | undefined;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), 'yt-video-'));
        const mp4Path = await extractYoutubeVideoMp4(videoId, tmpDir, env.YT_DLP_PATH);
        const filename = `${safeBasename(request.body?.title, videoId)}.${videoId}.mp4`;
        const dir = join(mediaRoot, folder.dirName);
        await mkdir(dir, { recursive: true });
        const dest = join(dir, filename);
        await copyFile(mp4Path, dest);
        await rm(tmpDir, { recursive: true, force: true });
        tmpDir = undefined;
        return {
          saved: true,
          kind: 'mp4',
          folder: folder.id,
          filename,
          nasPath: `${folder.nasLabel}/${filename}`,
        };
      } catch (err) {
        if (tmpDir) {
          await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
        }
        const message = err instanceof Error ? err.message : '';
        if (message === 'invalid_video_id') {
          return reply.code(400).send({ error: 'invalid_video_id' });
        }
        request.log.error({ err, videoId, folder: folderId }, 'admin video save to NAS failed');
        return reply.code(502).send({ error: 'video_extract_failed' });
      }
    },
  );
}
