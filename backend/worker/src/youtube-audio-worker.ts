import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import {
  YOUTUBE_AUDIO_QUEUE_NAME,
  bullmqConnection,
  classifyYtdlpError,
  createDb,
  createObjectStorage,
  extractYoutubeAudioMp3,
  loadWorkerEnv,
  persistRawBlob,
  youtubeAudioCache,
} from '@file-service/shared';

export async function startYoutubeAudioWorker(): Promise<Worker> {
  const env = loadWorkerEnv();
  const db = createDb(env.DATABASE_URL);
  const storage = createObjectStorage(env);
  await storage.ensureReady();

  const worker = new Worker(
    YOUTUBE_AUDIO_QUEUE_NAME,
    async (job) => {
      const { videoId, title } = job.data as { videoId: string; title?: string | null };
      const now = new Date();

      await db
        .update(youtubeAudioCache)
        .set({ status: 'processing', updatedAt: now, errorCode: null, errorDetail: null })
        .where(eq(youtubeAudioCache.youtubeVideoId, videoId));

      const workRoot = await mkdtemp(join(tmpdir(), 'yt-audio-'));
      try {
        const mp3Path = await extractYoutubeAudioMp3(videoId, workRoot, env.YT_DLP_PATH);
        const buf = await readFile(mp3Path);
        const persisted = await persistRawBlob({
          db,
          storage,
          buf,
          mimeType: 'audio/mpeg',
          filename: `${videoId}.mp3`,
          ext: 'mp3',
          title: title ?? videoId,
          uploadedBy: 'youtube-audio',
        });

        await db
          .update(youtubeAudioCache)
          .set({
            status: 'ready',
            blobId: persisted.blobId,
            title: title ?? null,
            completedAt: new Date(),
            updatedAt: new Date(),
            errorCode: null,
            errorDetail: null,
          })
          .where(eq(youtubeAudioCache.youtubeVideoId, videoId));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const errorCode = classifyYtdlpError(message, 'audio_extract_failed');

        await db
          .update(youtubeAudioCache)
          .set({
            status: 'failed',
            errorCode,
            errorDetail: message.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(eq(youtubeAudioCache.youtubeVideoId, videoId));
        throw e;
      } finally {
        await rm(workRoot, { recursive: true, force: true });
      }
    },
    {
      connection: bullmqConnection(env.REDIS_URL),
      concurrency: env.YOUTUBE_AUDIO_WORKER_CONCURRENCY,
      // yt-dlp 单次提取可达数分钟，默认 30s lock 会导致 job stalled
      lockDuration: 600_000,
      stalledInterval: 120_000,
      maxStalledCount: 2,
    },
  );

  worker.on('failed', async (job, err) => {
    console.error('youtube audio job failed', job?.id, err);
    const videoId = (job?.data as { videoId?: string } | undefined)?.videoId;
    if (!videoId) return;

    const message = err instanceof Error ? err.message : String(err);
    const errorCode = message.includes('stalled') ? 'job_stalled' : 'audio_extract_failed';
    await db
      .update(youtubeAudioCache)
      .set({
        status: 'failed',
        errorCode,
        errorDetail: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(youtubeAudioCache.youtubeVideoId, videoId),
          eq(youtubeAudioCache.status, 'processing'),
        ),
      );
  });

  worker.on('error', (err) => {
    console.error('youtube audio worker error', err);
  });

  console.log(
    'worker listening',
    YOUTUBE_AUDIO_QUEUE_NAME,
    'concurrency=',
    env.YOUTUBE_AUDIO_WORKER_CONCURRENCY,
  );

  return worker;
}
