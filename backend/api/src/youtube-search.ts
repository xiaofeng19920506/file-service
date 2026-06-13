import { searchYoutubeVideos, searchYoutubeVideosViaYtdlp, type ApiEnv } from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export function registerYoutubeSearchRoutes(app: FastifyInstance, opts: { env: ApiEnv }) {
  const { env } = opts;

  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/v1/youtube/search',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const q = request.query.q?.trim() ?? '';
      if (!q) return reply.code(400).send({ error: 'query_required' });
      if (q.length > 200) return reply.code(400).send({ error: 'query_too_long' });

      const limitRaw = Number.parseInt(request.query.limit ?? '12', 10);
      const maxResults = Number.isFinite(limitRaw) ? limitRaw : 12;

      try {
        const results = env.YOUTUBE_API_KEY
          ? await searchYoutubeVideos(q, env.YOUTUBE_API_KEY, { maxResults })
          : await searchYoutubeVideosViaYtdlp(q, env.YT_DLP_PATH, { maxResults });
        return { query: q, results };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'youtube_search_failed';
        if (msg === 'ytdlp_not_installed') {
          return reply.code(503).send({ error: 'ytdlp_not_installed' });
        }
        request.log.error(e, 'youtube search failed');
        return reply.code(502).send({ error: 'youtube_search_failed' });
      }
    },
  );
}
