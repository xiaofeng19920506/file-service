import {
  enqueueLyricsGenerate,
  fetchAllTrackLyrics,
  readStoredLyrics,
  saveReadyLyrics,
  storedLyricsToResult,
  type Db,
  type SubtitleLanguage,
} from '@file-service/shared';
import type { Queue } from 'bullmq';
import type { FastifyInstance } from 'fastify';

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function parseSubtitleLang(value: string | undefined): SubtitleLanguage {
  return value === 'en' ? 'en' : 'zh';
}

function emptyResult(videoId: string, language: SubtitleLanguage, generating: boolean) {
  return {
    videoId,
    language,
    sourceLanguage: null,
    translated: false,
    cues: [] as const,
    generating,
  };
}

export function registerYoutubeCaptionRoutes(
  app: FastifyInstance,
  deps: { db: Db; lyricsQueue: Queue },
) {
  const { db, lyricsQueue } = deps;

  app.get<{ Params: { videoId: string }; Querystring: { subtitleLang?: string; title?: string } }>(
    '/v1/youtube/videos/:videoId/captions',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!VIDEO_ID_RE.test(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }

      const subtitleLang = parseSubtitleLang(request.query.subtitleLang);
      const title = request.query.title?.trim() || undefined;

      const stored = await readStoredLyrics(db, videoId, subtitleLang);
      const fromDb = stored ? storedLyricsToResult(stored, videoId) : null;
      if (fromDb?.cues.length) return fromDb;

      try {
        const result = await fetchAllTrackLyrics(videoId, { subtitleLang, title });
        if (result?.cues.length) {
          await saveReadyLyrics(db, {
            videoId,
            language: result.language === 'en' ? 'en' : subtitleLang,
            source: result.sourceLanguage,
            title,
            cues: result.cues,
          });
          return { ...result, generating: false };
        }
      } catch (e) {
        request.log.warn(e, 'youtube captions fetch failed, retrying');
        try {
          const retry = await fetchAllTrackLyrics(videoId, { subtitleLang, title });
          if (retry?.cues.length) {
            await saveReadyLyrics(db, {
              videoId,
              language: retry.language === 'en' ? 'en' : subtitleLang,
              source: retry.sourceLanguage,
              title,
              cues: retry.cues,
            });
            return { ...retry, generating: false };
          }
        } catch (retryErr) {
          request.log.error(retryErr, 'youtube captions fetch failed');
          const generating = await enqueueLyricsGenerate(db, lyricsQueue, {
            videoId,
            title,
            subtitleLang,
          });
          if (generating) return emptyResult(videoId, subtitleLang, true);
          return reply.code(502).send({ error: 'captions_fetch_failed' });
        }
      }

      const generating = await enqueueLyricsGenerate(db, lyricsQueue, {
        videoId,
        title,
        subtitleLang,
      });
      return emptyResult(videoId, subtitleLang, generating || fromDb?.generating === true);
    },
  );
}
