import { Worker } from 'bullmq';
import {
  bullmqConnection,
  createDb,
  fetchAllTrackLyrics,
  loadWorkerEnv,
  markLyricsFailed,
  readStoredLyrics,
  saveReadyLyrics,
  YOUTUBE_LYRICS_QUEUE_NAME,
  type SubtitleLanguage,
} from '@file-service/shared';

export async function startYoutubeLyricsWorker(): Promise<Worker> {
  const env = loadWorkerEnv();
  const db = createDb(env.DATABASE_URL);

  const worker = new Worker(
    YOUTUBE_LYRICS_QUEUE_NAME,
    async (job) => {
      const { videoId, title, subtitleLang } = job.data as {
        videoId: string;
        title?: string;
        subtitleLang?: SubtitleLanguage;
      };
      const language: SubtitleLanguage = subtitleLang === 'en' ? 'en' : 'zh';
      const existing = await readStoredLyrics(db, videoId, language);
      if (existing?.status === 'ready' && existing.cues.length > 0) return;

      try {
        const result = await fetchAllTrackLyrics(videoId, { subtitleLang: language, title });
        if (result?.cues.length) {
          await saveReadyLyrics(db, {
            videoId,
            language: result.language === 'en' ? 'en' : 'zh',
            source: result.sourceLanguage,
            title,
            cues: result.cues,
          });
          return;
        }
        await markLyricsFailed(db, videoId, language, 'lyrics_not_found');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await markLyricsFailed(db, videoId, language, message.slice(0, 80));
        throw e;
      }
    },
    {
      connection: bullmqConnection(env.REDIS_URL),
      concurrency: 2,
      lockDuration: 180_000,
    },
  );

  worker.on('failed', (job, err) => {
    console.error('youtube lyrics job failed', job?.id, err);
  });
  worker.on('error', (err) => {
    console.error('youtube lyrics worker error', err);
  });
  console.log('worker listening', YOUTUBE_LYRICS_QUEUE_NAME);

  return worker;
}
