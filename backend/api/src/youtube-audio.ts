import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  blobs,
  ensureYoutubeAudioJobs,
  getAudioCacheMap,
  isValidYoutubeVideoId,
  serializeAudioCache,
  signAudioStreamToken,
  verifyAudioStreamToken,
  youtubeAudioCache,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import type { ObjectStorage } from '@file-service/shared';

function buildStreamPath(videoId: string, token: string): string {
  return `/v1/youtube/videos/${encodeURIComponent(videoId)}/audio/stream?token=${encodeURIComponent(token)}`;
}

function buildStreamUrl(env: ApiEnv, videoId: string, token: string): string {
  const path = buildStreamPath(videoId, token);
  const publicBase = env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  return publicBase ? `${publicBase}${path}` : path;
}

export function registerYoutubeAudioRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: ApiEnv; storage: ObjectStorage; audioQueue: Queue },
): void {
  const { db, env, storage, audioQueue } = deps;

  app.get<{ Params: { videoId: string } }>(
    '/v1/youtube/videos/:videoId/audio',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const [row] = await db
        .select()
        .from(youtubeAudioCache)
        .where(eq(youtubeAudioCache.youtubeVideoId, videoId));

      const status = row ? serializeAudioCache(row) : {
        videoId,
        status: 'pending' as const,
        blobId: null,
        errorCode: null,
      };

      if (status.status !== 'ready' || !status.blobId) {
        return status;
      }

      const expiresAtUnix = Math.floor(Date.now() / 1000) + env.DOWNLOAD_URL_TTL_SECONDS;
      const token = signAudioStreamToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        videoId,
        expiresAtUnix,
      });

      return {
        ...status,
        streamUrl: buildStreamUrl(env, videoId, token),
        expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
      };
    },
  );

  app.post<{ Params: { videoId: string }; Body: { title?: string } }>(
    '/v1/youtube/videos/:videoId/audio/extract',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      await ensureYoutubeAudioJobs(db, audioQueue, [
        { videoId, title: request.body?.title?.trim() || undefined },
      ]);

      const map = await getAudioCacheMap(db, [videoId]);
      return map.get(videoId)!;
    },
  );

  app.post<{ Params: { videoId: string } }>(
    '/v1/youtube/videos/:videoId/audio/stream-url',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const [row] = await db
        .select()
        .from(youtubeAudioCache)
        .where(eq(youtubeAudioCache.youtubeVideoId, videoId));
      if (!row || row.status !== 'ready' || !row.blobId) {
        return reply.code(404).send({ error: 'audio_not_ready' });
      }

      const expiresAtUnix = Math.floor(Date.now() / 1000) + env.DOWNLOAD_URL_TTL_SECONDS;
      const token = signAudioStreamToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        videoId,
        expiresAtUnix,
      });

      return {
        url: buildStreamUrl(env, videoId, token),
        expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
      };
    },
  );

  app.get<{ Params: { videoId: string }; Querystring: { token?: string } }>(
    '/v1/youtube/videos/:videoId/audio/stream',
    async (request, reply) => {
      const videoId = request.params.videoId;
      const token = request.query.token;
      if (!token) return reply.code(401).send({ error: 'token_required' });

      const verified = verifyAudioStreamToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        token,
      });
      if (!verified || verified.videoId !== videoId) {
        return reply.code(401).send({ error: 'invalid_token' });
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

      const stream = await storage.createReadStream(blob.storageKey);
      return reply
        .header('Content-Type', blob.mimeType ?? 'audio/mpeg')
        .header('Content-Disposition', `inline; filename="${blob.originalFilename ?? `${videoId}.mp3`}"`)
        .header('Accept-Ranges', 'bytes')
        .header('Cache-Control', 'private, max-age=3600')
        .send(stream);
    },
  );
}
