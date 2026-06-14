import {
  searchYoutubeVideos,
  searchYoutubeVideosViaYtdlp,
  YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE,
  YOUTUBE_SEARCH_MAX_TOTAL,
  type ApiEnv,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export function registerYoutubeSearchRoutes(app: FastifyInstance, opts: { env: ApiEnv }) {
  const { env } = opts;

  app.get<{ Querystring: { q?: string; limit?: string; pageToken?: string; offset?: string } }>(
    '/v1/youtube/search',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const q = request.query.q?.trim() ?? '';
      if (!q) return reply.code(400).send({ error: 'query_required' });
      if (q.length > 200) return reply.code(400).send({ error: 'query_too_long' });

      const limitRaw = Number.parseInt(request.query.limit ?? String(YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE), 10);
      const pageSize = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), YOUTUBE_SEARCH_MAX_TOTAL)
        : YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE;

      const pageToken = request.query.pageToken?.trim() || undefined;
      const offsetRaw = Number.parseInt(request.query.offset ?? '0', 10);
      const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

      if (offset >= YOUTUBE_SEARCH_MAX_TOTAL) {
        return {
          query: q,
          results: [],
          nextPageToken: null,
          hasMore: false,
          nextOffset: offset,
        };
      }

      const remaining = YOUTUBE_SEARCH_MAX_TOTAL - offset;
      const maxResults = Math.min(pageSize, remaining);

      try {
        const page = env.YOUTUBE_API_KEY
          ? await searchYoutubeVideos(q, env.YOUTUBE_API_KEY, { maxResults, pageToken })
          : await searchYoutubeVideosViaYtdlp(q, env.YT_DLP_PATH, { maxResults, offset });
        return { query: q, ...page };
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
