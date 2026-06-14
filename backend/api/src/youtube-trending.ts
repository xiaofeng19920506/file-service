import {
  getTrendingYoutubeSongs,
  recordYoutubeVideoPlay,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export function registerYoutubeTrendingRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get<{ Querystring: { limit?: string } }>('/v1/youtube/trending', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const limitRaw = Number.parseInt(request.query.limit ?? '10', 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 10;

    const data = await getTrendingYoutubeSongs(db, limit);
    return data;
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
      });
      return { ok: true };
    },
  );
}
