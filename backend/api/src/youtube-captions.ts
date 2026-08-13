import { fetchYoutubeVideoCaptions, type SubtitleLanguage } from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function parseSubtitleLang(value: string | undefined): SubtitleLanguage {
  return value === 'en' ? 'en' : 'zh';
}

export function registerYoutubeCaptionRoutes(app: FastifyInstance) {
  app.get<{ Params: { videoId: string }; Querystring: { subtitleLang?: string; title?: string } }>(
    '/v1/youtube/videos/:videoId/captions',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!VIDEO_ID_RE.test(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const subtitleLang = parseSubtitleLang(request.query.subtitleLang);
      const title = request.query.title?.trim() || undefined;

      try {
        const result = await fetchYoutubeVideoCaptions(videoId, { subtitleLang, title });
        if (!result?.cues.length) {
          return {
            videoId,
            language: subtitleLang,
            sourceLanguage: null,
            translated: false,
            cues: [],
          };
        }
        return result;
      } catch (e) {
        request.log.warn(e, 'youtube captions fetch failed, retrying');
        try {
          const retry = await fetchYoutubeVideoCaptions(videoId, { subtitleLang, title });
          if (!retry?.cues.length) {
            return {
              videoId,
              language: subtitleLang,
              sourceLanguage: null,
              translated: false,
              cues: [],
            };
          }
          return retry;
        } catch (retryErr) {
          request.log.error(retryErr, 'youtube captions fetch failed');
          return reply.code(502).send({ error: 'captions_fetch_failed' });
        }
      }
    },
  );
}
