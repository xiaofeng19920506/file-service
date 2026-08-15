import {
  searchYoutubeVideos,
  searchYoutubeVideosViaYtdlp,
  getUserLibraryVideoIdSet,
  fetchYoutubeSearchSuggestionsRemote,
  YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE,
  YOUTUBE_SEARCH_MAX_PAGE_SIZE,
  YTDLP_SEARCH_DEFAULT_PAGE_SIZE,
  YTDLP_SEARCH_MAX_PAGE_SIZE,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export function registerYoutubeSearchRoutes(
  app: FastifyInstance,
  opts: { db: Db; env: ApiEnv },
) {
  const { db, env } = opts;

  app.get<{ Querystring: { q?: string } }>(
    '/v1/youtube/search/suggest',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const q = request.query.q?.trim() ?? '';
      if (!q) return { suggestions: [] };
      if (q.length > 200) return reply.code(400).send({ error: 'query_too_long' });

      try {
        const suggestions = await fetchYoutubeSearchSuggestionsRemote(q);
        return { suggestions: suggestions.slice(0, 12) };
      } catch (e) {
        request.log.warn(e, 'youtube search suggest failed');
        return { suggestions: [] };
      }
    },
  );

  app.get<{ Querystring: { q?: string; limit?: string; pageToken?: string; offset?: string } }>(
    '/v1/youtube/search',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const q = request.query.q?.trim() ?? '';
      if (!q) return reply.code(400).send({ error: 'query_required' });
      if (q.length > 200) return reply.code(400).send({ error: 'query_too_long' });

      const limitRaw = Number.parseInt(request.query.limit ?? String(YTDLP_SEARCH_DEFAULT_PAGE_SIZE), 10);
      const ytdlpMaxResults = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), YTDLP_SEARCH_MAX_PAGE_SIZE)
        : YTDLP_SEARCH_DEFAULT_PAGE_SIZE;
      const apiMaxResults = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), YOUTUBE_SEARCH_MAX_PAGE_SIZE)
        : YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE;

      const pageToken = request.query.pageToken?.trim() || undefined;
      const offsetRaw = Number.parseInt(request.query.offset ?? '0', 10);
      const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

      try {
        const searchPage = async () => {
          try {
            return await searchYoutubeVideosViaYtdlp(q, env.YT_DLP_PATH, {
              maxResults: ytdlpMaxResults,
              offset,
            });
          } catch (e) {
            if (!env.YOUTUBE_API_KEY) throw e;
            request.log.warn(e, 'yt-dlp search failed, falling back to YouTube Data API');
            return searchYoutubeVideos(q, env.YOUTUBE_API_KEY, {
              maxResults: apiMaxResults,
              pageToken,
            });
          }
        };

        const [page, libraryIds] = await Promise.all([
          searchPage(),
          getUserLibraryVideoIdSet(db, user.id),
        ]);

        return {
          query: q,
          ...page,
          results: page.results.map((row) => ({
            ...row,
            inLibrary: libraryIds.has(row.videoId),
          })),
        };
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
