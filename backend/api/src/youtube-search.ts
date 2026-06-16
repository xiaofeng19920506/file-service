import {
  searchYoutubeVideos,
  searchYoutubeVideosViaYtdlp,
  getUserLibraryVideoIdSet,
  getVideoCacheMap,
  prefetchYoutubeVideosFromSearch,
  canAccessVipVideo,
  fetchYoutubeSearchSuggestionsRemote,
  YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE,
  YOUTUBE_SEARCH_MAX_PAGE_SIZE,
  type ApiEnv,
  type Db,
  type YoutubeVideoExtractQueue,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export function registerYoutubeSearchRoutes(
  app: FastifyInstance,
  opts: { db: Db; env: ApiEnv; videoQueue: YoutubeVideoExtractQueue },
) {
  const { db, env, videoQueue } = opts;

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

      const limitRaw = Number.parseInt(request.query.limit ?? String(YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE), 10);
      const maxResults = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), YOUTUBE_SEARCH_MAX_PAGE_SIZE)
        : YOUTUBE_SEARCH_DEFAULT_PAGE_SIZE;

      const pageToken = request.query.pageToken?.trim() || undefined;
      const offsetRaw = Number.parseInt(request.query.offset ?? '0', 10);
      const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

      try {
        const [page, libraryIds] = await Promise.all([
          env.YOUTUBE_API_KEY
            ? searchYoutubeVideos(q, env.YOUTUBE_API_KEY, { maxResults, pageToken })
            : searchYoutubeVideosViaYtdlp(q, env.YT_DLP_PATH, { maxResults, offset }),
          getUserLibraryVideoIdSet(db, user.id),
        ]);

        const vipVideo = canAccessVipVideo(user.role);

        if (vipVideo) {
          void prefetchYoutubeVideosFromSearch(db, videoQueue, page.results).catch((err) => {
            request.log.warn({ err }, 'vip search video prefetch failed');
          });
        }

        const videoCache = vipVideo
          ? await getVideoCacheMap(
              db,
              page.results.map((row) => row.videoId),
            )
          : null;

        return {
          query: q,
          ...page,
          results: page.results.map((row) => ({
            ...row,
            inLibrary: libraryIds.has(row.videoId),
            ...(videoCache
              ? {
                  video: {
                    status: videoCache.get(row.videoId)?.status ?? 'pending',
                  },
                }
              : {}),
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
