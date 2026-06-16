import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import {
  YOUTUBE_VIDEO_QUEUE_NAME,
  bullmqConnection,
  createDb,
  createObjectStorage,
  extractYoutubeVideoMp4,
  loadWorkerEnv,
  persistRawBlob,
  youtubeVideoCache,
} from '@file-service/shared';

export async function startYoutubeVideoWorker(): Promise<Worker> {
  const env = loadWorkerEnv();
  const db = createDb(env.DATABASE_URL);
  const storage = createObjectStorage(env);
  await storage.ensureReady();

  const worker = new Worker(
    YOUTUBE_VIDEO_QUEUE_NAME,
    async (job) => {
      const { videoId, title } = job.data as { videoId: string; title?: string | null };
      const now = new Date();

      await db
        .update(youtubeVideoCache)
        .set({ status: 'processing', updatedAt: now, errorCode: null, errorDetail: null })
        .where(eq(youtubeVideoCache.youtubeVideoId, videoId));

      const workRoot = await mkdtemp(join(tmpdir(), 'yt-video-'));
      try {
        const mp4Path = await extractYoutubeVideoMp4(videoId, workRoot, env.YT_DLP_PATH);
        const buf = await readFile(mp4Path);
        const persisted = await persistRawBlob({
          db,
          storage,
          buf,
          mimeType: 'video/mp4',
          filename: `${videoId}.mp4`,
          ext: 'mp4',
          title: title ?? videoId,
          uploadedBy: 'youtube-video',
        });

        await db
          .update(youtubeVideoCache)
          .set({
            status: 'ready',
            blobId: persisted.blobId,
            title: title ?? null,
            completedAt: new Date(),
            updatedAt: new Date(),
            errorCode: null,
            errorDetail: null,
          })
          .where(eq(youtubeVideoCache.youtubeVideoId, videoId));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const errorCode =
          message === 'invalid_video_id'
            ? 'invalid_video_id'
            : message.includes('ffmpeg') || message.includes('ffprobe')
              ? 'ffmpeg_not_installed'
              : message.includes('ENOENT') || message.includes('not found')
                ? 'ytdlp_not_installed'
                : 'video_extract_failed';

        await db
          .update(youtubeVideoCache)
          .set({
            status: 'failed',
            errorCode,
            errorDetail: message.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(eq(youtubeVideoCache.youtubeVideoId, videoId));
        throw e;
      } finally {
        await rm(workRoot, { recursive: true, force: true });
      }
    },
    {
      connection: bullmqConnection(env.REDIS_URL),
      concurrency: env.YOUTUBE_VIDEO_WORKER_CONCURRENCY,
      lockDuration: 900_000,
      stalledInterval: 180_000,
      maxStalledCount: 2,
    },
  );

  worker.on('failed', async (job, err) => {
    console.error('youtube video job failed', job?.id, err);
  });

  return worker;
}
