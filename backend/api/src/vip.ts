import { asc, eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  ensureYoutubeVideoJobs,
  getVideoCacheMap,
  isValidYoutubeVideoId,
  playlistItems,
  playlists,
  signAudioStreamToken,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

function buildStreamUrl(env: ApiEnv, videoId: string, token: string): string {
  const path = `/v1/youtube/videos/${encodeURIComponent(videoId)}/video/stream?token=${encodeURIComponent(token)}`;
  const publicBase = env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!publicBase || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(publicBase)) {
    return path;
  }
  return `${publicBase}${path}`;
}

export function registerVipRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: ApiEnv; videoQueue: Queue },
): void {
  const { db, env, videoQueue } = deps;

  app.get('/v1/vip/playlist', async (_request, reply) => {
    const playlistId = env.VIP_PLAYLIST_ID?.trim();
    if (!playlistId) {
      return reply.code(503).send({ error: 'vip_playlist_not_configured' });
    }

    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
    if (!playlist) {
      return reply.code(404).send({ error: 'vip_playlist_not_found' });
    }

    const items = await db
      .select()
      .from(playlistItems)
      .where(eq(playlistItems.playlistId, playlist.id))
      .orderBy(asc(playlistItems.sortOrder));

    const videoIds = items.map((i) => i.youtubeVideoId).filter(isValidYoutubeVideoId);
    const cacheMap = await getVideoCacheMap(db, videoIds);

    await ensureYoutubeVideoJobs(
      db,
      videoQueue,
      items.map((item) => ({ videoId: item.youtubeVideoId, title: item.title })),
      { priorityOrder: videoIds },
    );

    const expiresAtUnix = Math.floor(Date.now() / 1000) + env.DOWNLOAD_URL_TTL_SECONDS;

    return {
      playlist: {
        id: playlist.id,
        title: playlist.title,
      },
      items: items.map((item) => {
        const cache = cacheMap.get(item.youtubeVideoId);
        const status = cache?.status ?? 'pending';
        let streamUrl: string | null = null;
        let expiresAt: string | null = null;
        if (status === 'ready' && cache?.blobId) {
          const token = signAudioStreamToken({
            secret: env.DOWNLOAD_HMAC_SECRET,
            videoId: item.youtubeVideoId,
            expiresAtUnix,
          });
          streamUrl = buildStreamUrl(env, item.youtubeVideoId, token);
          expiresAt = new Date(expiresAtUnix * 1000).toISOString();
        }
        return {
          id: item.id,
          title: item.title,
          youtubeVideoId: item.youtubeVideoId,
          youtubeUrl: item.youtubeUrl,
          video: {
            status,
            errorCode: cache?.errorCode ?? null,
            streamUrl,
            expiresAt,
          },
        };
      }),
    };
  });
}
