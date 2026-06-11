import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  blobs,
  ensureYoutubeAudioJobs,
  prioritizeYoutubeAudioJobs,
  getAudioCacheMap,
  isValidYoutubeVideoId,
  serializeAudioCache,
  signAudioStreamToken,
  spawnYoutubeAudioPreviewStream,
  verifyAudioStreamToken,
  youtubeAudioCache,
  fetchYoutubeVideoDurationSeconds,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import type { ObjectStorage } from '@file-service/shared';

function buildStreamPath(videoId: string, token: string): string {
  return `/v1/youtube/videos/${encodeURIComponent(videoId)}/audio/stream?token=${encodeURIComponent(token)}`;
}

function buildPreviewPath(videoId: string, token: string): string {
  return `/v1/youtube/videos/${encodeURIComponent(videoId)}/audio/preview?token=${encodeURIComponent(token)}`;
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

function buildPreviewUrl(env: ApiEnv, videoId: string, token: string): string {
  return buildSignedMediaUrl(env, buildPreviewPath(videoId, token));
}

const durationCache = new Map<string, { seconds: number; cachedAt: number }>();
const DURATION_CACHE_TTL_MS = 86_400_000;

async function getCachedVideoDurationSeconds(videoId: string): Promise<number | null> {
  const hit = durationCache.get(videoId);
  if (hit && Date.now() - hit.cachedAt < DURATION_CACHE_TTL_MS) return hit.seconds;
  const seconds = await fetchYoutubeVideoDurationSeconds(videoId);
  if (seconds !== null) {
    durationCache.set(videoId, { seconds, cachedAt: Date.now() });
  }
  return seconds;
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

      const { token, expiresAt } = signMediaToken(env, videoId);
      const durationSeconds = await getCachedVideoDurationSeconds(videoId);

      if (status.status !== 'ready' || !status.blobId) {
        return {
          ...status,
          durationSeconds: durationSeconds ?? undefined,
          previewStreamUrl: buildPreviewUrl(env, videoId, token),
          previewExpiresAt: expiresAt,
        };
      }

      return {
        ...status,
        durationSeconds: durationSeconds ?? undefined,
        streamUrl: buildStreamUrl(env, videoId, token),
        expiresAt,
        previewStreamUrl: buildPreviewUrl(env, videoId, token),
        previewExpiresAt: expiresAt,
      };
    },
  );

  app.post<{ Body: { videoIds?: string[]; entries?: { videoId: string; title?: string }[] } }>(
    '/v1/youtube/audio/prioritize',
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

      await prioritizeYoutubeAudioJobs(db, audioQueue, order, entries.length ? entries : undefined);
      return { ok: true, prioritized: order.length };
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

      const { token, expiresAt } = signMediaToken(env, videoId);

      return {
        url: buildStreamUrl(env, videoId, token),
        expiresAt,
      };
    },
  );

  app.get<{ Params: { videoId: string }; Querystring: { token?: string } }>(
    '/v1/youtube/videos/:videoId/audio/preview',
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

      let child: ReturnType<typeof spawnYoutubeAudioPreviewStream>;
      try {
        child = spawnYoutubeAudioPreviewStream(videoId, env.YT_DLP_PATH);
      } catch {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }
      if (!child.stdout) {
        child.kill('SIGTERM');
        return reply.code(502).send({ error: 'audio_preview_failed' });
      }

      const cleanup = () => {
        if (!child.killed) child.kill('SIGTERM');
      };
      request.raw.on('close', cleanup);

      child.stderr?.on('data', (chunk: Buffer) => {
        request.log.warn({ videoId, stderr: chunk.toString().slice(0, 200) }, 'audio preview stderr');
      });

      child.on('error', (err) => {
        request.log.error({ err, videoId }, 'audio preview spawn failed');
        cleanup();
        if (!reply.sent) void reply.code(502).send({ error: 'audio_preview_failed' });
      });

      child.on('close', (code) => {
        cleanup();
        if (code !== 0 && !reply.sent) {
          void reply.code(502).send({ error: 'audio_preview_failed' });
        }
      });

      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Cache-Control', 'no-store')
        .header('Accept-Ranges', 'none')
        .send(child.stdout);
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
        .header('Content-Length', String(blob.sizeBytes))
        .header('Content-Disposition', `inline; filename="${blob.originalFilename ?? `${videoId}.mp3`}"`)
        .header('Accept-Ranges', 'bytes')
        .header('Cache-Control', 'private, max-age=3600')
        .send(stream);
    },
  );
}
