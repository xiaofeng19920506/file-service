import {
  getTrendingYoutubeSongs,
  recordYoutubeVideoPlay,
  recordYoutubeUserSearch,
  getPersonalizedYoutubeRecommendations,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export function registerYoutubeTrendingRoutes(
  app: FastifyInstance,
  opts: { db: Db },
) {
  const { db } = opts;

  app.get<{ Querystring: { limit?: string } }>(
    '/v1/youtube/recommendations',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const limitRaw = Number.parseInt(request.query.limit ?? '10', 10);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 10;

      return getPersonalizedYoutubeRecommendations(db, user.id, limit);
    },
  );

  app.get<{ Querystring: { limit?: string } }>('/v1/youtube/trending', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const limitRaw = Number.parseInt(request.query.limit ?? '10', 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 10;

    return getTrendingYoutubeSongs(db, limit, user.id);
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
