import {
  getTrendingYoutubeSongs,
  recordYoutubeVideoPlay,
  recordYoutubeUserSearch,
  getPersonalizedYoutubeRecommendations,
  prefetchYoutubeVideosFromSearch,
  canAccessVipVideo,
  getVideoCacheMap,
  type Db,
  type YoutubeVideoExtractQueue,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export function registerYoutubeTrendingRoutes(
  app: FastifyInstance,
  opts: { db: Db; videoQueue: YoutubeVideoExtractQueue },
) {
  const { db, videoQueue } = opts;

  app.get<{ Querystring: { limit?: string } }>(
    '/v1/youtube/recommendations',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const limitRaw = Number.parseInt(request.query.limit ?? '10', 10);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 10;

      const data = await getPersonalizedYoutubeRecommendations(db, user.id, limit);
      const vipVideo = canAccessVipVideo(user.role);

      if (vipVideo) {
        void prefetchYoutubeVideosFromSearch(
          db,
          videoQueue,
          data.songs.map((song) => ({
            videoId: song.videoId,
            title: song.title,
            relevanceScore: song.playCount,
          })),
        ).catch((err) => {
          request.log.warn({ err }, 'vip recommendations video prefetch failed');
        });
      }

      const videoCache = vipVideo
        ? await getVideoCacheMap(
            db,
            data.songs.map((song) => song.videoId),
          )
        : null;

      return {
        ...data,
        songs: data.songs.map((song) => ({
          ...song,
          ...(videoCache
            ? {
                video: {
                  status: videoCache.get(song.videoId)?.status ?? 'pending',
                },
              }
            : {}),
        })),
      };
    },
  );

  app.get<{ Querystring: { limit?: string } }>('/v1/youtube/trending', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const limitRaw = Number.parseInt(request.query.limit ?? '10', 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 10;

    const data = await getTrendingYoutubeSongs(db, limit, user.id);
    const vipVideo = canAccessVipVideo(user.role);

    if (vipVideo) {
      void prefetchYoutubeVideosFromSearch(
        db,
        videoQueue,
        data.songs.map((song) => ({
          videoId: song.videoId,
          title: song.title,
          relevanceScore: song.playCount,
        })),
      ).catch((err) => {
        request.log.warn({ err }, 'vip trending video prefetch failed');
      });
    }

    const videoCache = vipVideo
      ? await getVideoCacheMap(
          db,
          data.songs.map((song) => song.videoId),
        )
      : null;

    return {
      ...data,
      songs: data.songs.map((song) => ({
        ...song,
        ...(videoCache
          ? {
              video: {
                status: videoCache.get(song.videoId)?.status ?? 'pending',
              },
            }
          : {}),
      })),
    };
  });

  app.post<{ Body: { videoId?: string; title?: string; channelTitle?: string | null } }>(
    '/v1/youtube/plays',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const videoId = request.body?.videoId?.trim() ?? '';
      const title = request.body?.title?.trim() ?? '';
      if (!videoId || !title) return reply.code(400).send({ error: 'invalid_request' });

      await recordYoutubeVideoPlay(db, {
        videoId,
        title,
        channelTitle: request.body?.channelTitle ?? null,
        userId: user.id,
      });
      return { ok: true };
    },
  );

  app.post<{ Body: { query?: string } }>('/v1/youtube/searches', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const query = request.body?.query?.trim() ?? '';
    if (!query) return reply.code(400).send({ error: 'query_required' });
    if (query.length > 200) return reply.code(400).send({ error: 'query_too_long' });

    await recordYoutubeUserSearch(db, user.id, query);
    return { ok: true };
  });
}
