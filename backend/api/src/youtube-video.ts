import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  blobs,
  ensureYoutubeVideoJobs,
  getVideoCacheMap,
  isValidYoutubeVideoId,
  prioritizeYoutubeVideoJobs,
  serializeVideoCache,
  signAudioStreamToken,
  verifyAudioStreamToken,
  youtubeVideoCache,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import type { ObjectStorage } from '@file-service/shared';

function buildStreamPath(videoId: string, token: string): string {
  return `/v1/youtube/videos/${encodeURIComponent(videoId)}/video/stream?token=${encodeURIComponent(token)}`;
}

function buildSignedMediaUrl(env: ApiEnv, path: string): string {
  const publicBase = env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!publicBase || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(publicBase)) {
    return path;
  }
  return `${publicBase}${path}`;
}

function buildStreamUrl(env: ApiEnv, videoId: string, token: string): string {
  return buildSignedMediaUrl(env, buildStreamPath(videoId, token));
}

function signMediaToken(env: ApiEnv, videoId: string): { token: string; expiresAt: string } {
  const expiresAtUnix = Math.floor(Date.now() / 1000) + env.DOWNLOAD_URL_TTL_SECONDS;
  const token = signAudioStreamToken({
    secret: env.DOWNLOAD_HMAC_SECRET,
    videoId,
    expiresAtUnix,
  });
  return {
    token,
    expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
  };
}

export function registerYoutubeVideoRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: ApiEnv; storage: ObjectStorage; videoQueue: Queue },
): void {
  const { db, env, storage, videoQueue } = deps;

  app.get<{ Params: { videoId: string } }>(
    '/v1/youtube/videos/:videoId/video',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const [row] = await db
        .select()
        .from(youtubeVideoCache)
        .where(eq(youtubeVideoCache.youtubeVideoId, videoId));

      const status = row
        ? serializeVideoCache(row)
        : { videoId, status: 'pending' as const, blobId: null, errorCode: null };

      const { token, expiresAt } = signMediaToken(env, videoId);

      if (status.status !== 'ready' || !status.blobId) {
        return { ...status, streamUrl: null, expiresAt: null };
      }

      return {
        ...status,
        streamUrl: buildStreamUrl(env, videoId, token),
        expiresAt,
      };
    },
  );

  app.post<{ Body: { videoIds?: string[] } }>(
    '/v1/youtube/video/status',
    async (request, reply) => {
      const raw = request.body?.videoIds ?? [];
      const videoIds = [...new Set(raw.filter(isValidYoutubeVideoId))].slice(0, 20);
      if (!videoIds.length) {
        return reply.code(400).send({ error: 'video_ids_required' });
      }

      const cacheMap = await getVideoCacheMap(db, videoIds);
      const items = videoIds.map((videoId) => {
        const status = cacheMap.get(videoId)!;
        if (status.status !== 'ready' || !status.blobId) {
          return { ...status, streamUrl: null as string | null, expiresAt: null as string | null };
        }
        const { token, expiresAt } = signMediaToken(env, videoId);
        return {
          ...status,
          streamUrl: buildStreamUrl(env, videoId, token),
          expiresAt,
        };
      });
      return { items };
    },
  );

  app.post<{ Body: { videoIds?: string[]; entries?: { videoId: string; title?: string }[] } }>(
    '/v1/youtube/video/prioritize',
    async (request, reply) => {
      const videoIds = request.body?.videoIds ?? [];
      const entries = request.body?.entries ?? [];
      const order =
        videoIds.length > 0
          ? videoIds
          : entries.map((e) => e.videoId).filter(isValidYoutubeVideoId);
      if (!order.length) {
        return reply.code(400).send({ error: 'video_ids_required' });
      }

      await prioritizeYoutubeVideoJobs(
        db,
        videoQueue,
        order,
        entries.length ? entries : undefined,
      );
      return { ok: true, prioritized: order.length };
    },
  );

  app.post<{ Params: { videoId: string }; Body: { title?: string } }>(
    '/v1/youtube/videos/:videoId/video/extract',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      await ensureYoutubeVideoJobs(db, videoQueue, [
        { videoId, title: request.body?.title?.trim() || undefined },
      ]);

      const map = await getVideoCacheMap(db, [videoId]);
      return map.get(videoId)!;
    },
  );

  app.get<{ Params: { videoId: string }; Querystring: { token?: string } }>(
    '/v1/youtube/videos/:videoId/video/stream',
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
        .from(youtubeVideoCache)
        .where(eq(youtubeVideoCache.youtubeVideoId, videoId));
      if (!cache || cache.status !== 'ready' || !cache.blobId) {
        return reply.code(404).send({ error: 'video_not_ready' });
      }

      const [blob] = await db.select().from(blobs).where(eq(blobs.id, cache.blobId));
      if (!blob) return reply.code(404).send({ error: 'not_found' });

      const stream = await storage.createReadStream(blob.storageKey);
      return reply
        .header('Content-Type', blob.mimeType ?? 'video/mp4')
        .header('Content-Length', String(blob.sizeBytes))
        .header('Content-Disposition', `inline; filename="${blob.originalFilename ?? `${videoId}.mp4`}"`)
        .header('Accept-Ranges', 'bytes')
        .header('Cache-Control', 'private, max-age=3600')
        .send(stream);
    },
  );
}
