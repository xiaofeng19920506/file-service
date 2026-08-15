import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  blobs,
  contentDisposition,
  ensureYoutubeAudioJobs,
  extractYoutubeVideoMp4,
  isValidYoutubeVideoId,
  serializeAudioCache,
  youtubeAudioCache,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import type { ObjectStorage } from '@file-service/shared';

const VIDEO_DOWNLOAD_TIMEOUT_MS = 650_000;

function attachmentFilename(title: string | undefined, videoId: string, ext: 'mp3' | 'mp4'): string {
  const raw = (title?.trim() || videoId).replace(/[\r\n"/\\:*?<>|]+/g, '_').slice(0, 180);
  const base = raw.replace(/\.(mp3|mp4)$/i, '') || videoId;
  return `${base}.${ext}`;
}

export function registerAdminDownloadRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: ApiEnv; storage: ObjectStorage; audioQueue: Queue },
): void {
  const { db, env, storage, audioQueue } = deps;

  app.post<{ Params: { videoId: string }; Body: { title?: string } }>(
    '/v1/admin/youtube/videos/:videoId/audio/download',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const [row] = await db
        .select()
        .from(youtubeAudioCache)
        .where(eq(youtubeAudioCache.youtubeVideoId, videoId));

      if (row?.status === 'ready' && row.blobId) {
        return { ready: true, status: serializeAudioCache(row) };
      }

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

  app.get<{ Params: { videoId: string }; Querystring: { title?: string } }>(
    '/v1/admin/youtube/videos/:videoId/audio/download',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const [cache] = await db
        .select()
        .from(youtubeAudioCache)
        .where(eq(youtubeAudioCache.youtubeVideoId, videoId));
      if (!cache || cache.status !== 'ready' || !cache.blobId) {
        return reply.code(404).send({ error: 'audio_not_ready' });
      }

      const [blob] = await db.select().from(blobs).where(eq(blobs.id, cache.blobId));
      if (!blob) return reply.code(404).send({ error: 'not_found' });

      const filename = attachmentFilename(
        request.query.title || blob.originalFilename || cache.title || undefined,
        videoId,
        'mp3',
      );
      const stream = await storage.createReadStream(blob.storageKey);
      return reply
        .header('Content-Type', blob.mimeType ?? 'audio/mpeg')
        .header('Content-Length', String(blob.sizeBytes))
        .header('Content-Disposition', contentDisposition('attachment', filename, `${videoId}.mp3`))
        .header('Cache-Control', 'private, no-store')
        .send(stream);
    },
  );

  app.get<{ Params: { videoId: string }; Querystring: { title?: string } }>(
    '/v1/admin/youtube/videos/:videoId/video/download',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      request.raw.setTimeout(VIDEO_DOWNLOAD_TIMEOUT_MS);
      reply.raw.setTimeout(VIDEO_DOWNLOAD_TIMEOUT_MS);

      let tmpDir: string | undefined;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), 'yt-video-'));
        const mp4Path = await extractYoutubeVideoMp4(videoId, tmpDir, env.YT_DLP_PATH);
        const filename = attachmentFilename(request.query.title, videoId, 'mp4');
        const stream = createReadStream(mp4Path);
        const dirToClean = tmpDir;
        const cleanup = () => {
          void rm(dirToClean, { recursive: true, force: true });
        };
        stream.on('close', cleanup);
        stream.on('error', cleanup);
        request.raw.on('close', () => {
          stream.destroy();
        });
        tmpDir = undefined;
        return reply
          .header('Content-Type', 'video/mp4')
          .header('Content-Disposition', contentDisposition('attachment', filename, `${videoId}.mp4`))
          .header('Cache-Control', 'private, no-store')
          .send(stream);
      } catch (err) {
        if (tmpDir) {
          await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
        }
        const message = err instanceof Error ? err.message : '';
        if (message === 'invalid_video_id') {
          return reply.code(400).send({ error: 'invalid_video_id' });
        }
        request.log.error({ err, videoId }, 'admin video download failed');
        return reply.code(502).send({ error: 'video_extract_failed' });
      }
    },
  );
}
