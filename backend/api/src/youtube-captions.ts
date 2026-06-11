import { fetchYoutubeVideoCaptions, type SubtitleLanguage } from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function parseSubtitleLang(value: string | undefined): SubtitleLanguage {
  return value === 'en' ? 'en' : 'zh';
}

export function registerYoutubeCaptionRoutes(app: FastifyInstance) {
  app.get<{ Params: { videoId: string }; Querystring: { subtitleLang?: string } }>(
    '/v1/youtube/videos/:videoId/captions',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!VIDEO_ID_RE.test(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const subtitleLang = parseSubtitleLang(request.query.subtitleLang);

      try {
        const result = await fetchYoutubeVideoCaptions(videoId, { subtitleLang });
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
        request.log.error(e, 'youtube captions fetch failed');
        return reply.code(502).send({ error: 'captions_fetch_failed' });
      }
    },
  );
}
