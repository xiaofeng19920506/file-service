import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import {
  adminMediaFolderById,
  blobs,
  classifyYtdlpError,
  ensureYoutubeAudioJobs,
  extractYoutubeVideoMp4,
  isValidYoutubeVideoId,
  parseAdminMediaFolderId,
  seriesFolderFromTitle,
  youtubeAudioCache,
  type AdminMediaFolderId,
  type ApiEnv,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import type { ObjectStorage } from '@file-service/shared';

const MAX_PARALLEL_DOWNLOADS = 3;
const JOB_TTL_MS = 6 * 60 * 60_000;

export type AdminDownloadJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type AdminDownloadJob = {
  jobId: string;
  kind: 'mp3' | 'mp4';
  videoId: string;
  title?: string;
  folder?: AdminMediaFolderId;
  folderLabel?: string;
  seriesName?: string;
  status: AdminDownloadJobStatus;
  percent: number;
  stage: string;
  queuePosition: number;
  nasPath?: string;
  filename?: string;
  error?: string;
  createdAt: number;
};

function safeBasename(title: string | undefined, videoId: string): string {
  const raw = (title?.trim() || videoId).replace(/[\r\n"/\\:*?<>|]+/g, '_').slice(0, 120);
  return raw.replace(/\.(mp3|mp4)$/i, '') || videoId;
}

function adminDownloadRoot(env: ApiEnv): string {
  const configured = env.ADMIN_DOWNLOAD_DIR?.trim();
  if (configured) return configured;
  if (env.STORAGE_BACKEND === 'fs') return join(env.LOCAL_STORAGE_DIR, 'downloads');
  return join(tmpdir(), 'file-service-downloads');
}

function adminAudioRoot(env: ApiEnv): string {
  const configured = env.ADMIN_NAS_AUDIO_DIR?.trim();
  if (configured) return configured;
  return join(adminDownloadRoot(env), '音频');
}

function adminMediaRoot(env: ApiEnv): string {
  return env.ADMIN_NAS_MEDIA_DIR?.trim() || join(adminDownloadRoot(env), '影视');
}

function createJobRunner(deps: {
  db: Db;
  env: ApiEnv;
  storage: ObjectStorage;
  audioQueue: Queue;
}) {
  const { db, env, storage, audioQueue } = deps;
  const audioRoot = adminAudioRoot(env);
  const mediaRoot = adminMediaRoot(env);
  const jobs = new Map<string, AdminDownloadJob>();
  const waitQueue: string[] = [];
  let running = 0;

  const publicJob = (job: AdminDownloadJob): AdminDownloadJob => {
    const queuedAhead = waitQueue.indexOf(job.jobId);
    return {
      ...job,
      queuePosition:
        job.status === 'queued' ? (queuedAhead >= 0 ? queuedAhead + 1 : 1) : 0,
    };
  };

  const listJobs = () =>
    [...jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 40)
      .map(publicJob);

  const prune = () => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
      if ((job.status === 'done' || job.status === 'failed') && job.createdAt < cutoff) {
        jobs.delete(id);
      }
    }
  };

  const saveAudioToNas = async (videoId: string, titleHint?: string) => {
    const [cache] = await db
      .select()
      .from(youtubeAudioCache)
      .where(eq(youtubeAudioCache.youtubeVideoId, videoId));
    if (!cache || cache.status !== 'ready' || !cache.blobId) return null;

    const [blob] = await db.select().from(blobs).where(eq(blobs.id, cache.blobId));
    if (!blob) throw new Error('not_found');

    const filename = `${safeBasename(titleHint || cache.title || blob.originalFilename || undefined, videoId)}.${videoId}.mp3`;
    await mkdir(audioRoot, { recursive: true });
    const dest = join(audioRoot, filename);
    await storage.copyToFile(blob.storageKey, dest);
    return { filename, nasPath: `存储空间 1/音频/${filename}` };
  };

  const runMp3 = async (job: AdminDownloadJob) => {
    job.stage = 'extracting';
    job.percent = 8;
    const savedNow = await saveAudioToNas(job.videoId, job.title);
    if (savedNow) {
      job.filename = savedNow.filename;
      job.nasPath = savedNow.nasPath;
      job.percent = 100;
      job.stage = 'done';
      job.status = 'done';
      return;
    }

    await ensureYoutubeAudioJobs(db, audioQueue, [
      { videoId: job.videoId, title: job.title },
    ]);

    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      if (job.status !== 'running') return;
      const [row] = await db
        .select()
        .from(youtubeAudioCache)
        .where(eq(youtubeAudioCache.youtubeVideoId, job.videoId));
      if (row?.status === 'ready') {
        job.percent = 85;
        job.stage = 'saving';
        const saved = await saveAudioToNas(job.videoId, job.title || row.title || undefined);
        if (!saved) throw new Error('audio_not_ready');
        job.filename = saved.filename;
        job.nasPath = saved.nasPath;
        job.percent = 100;
        job.stage = 'done';
        job.status = 'done';
        return;
      }
      if (row?.status === 'failed') {
        throw new Error(row.errorCode || 'audio_extract_failed');
      }
      job.percent = Math.min(80, job.percent < 15 ? 15 : job.percent + 2);
      job.stage = 'extracting';
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error('download_timeout');
  };

  const runMp4 = async (job: AdminDownloadJob) => {
    const folderId = job.folder;
    if (!folderId) throw new Error('invalid_download_folder');
    const folder = adminMediaFolderById(folderId);
    job.stage = 'starting';
    job.percent = 1;
    const tmpDir = await mkdtemp(join(tmpdir(), 'yt-video-'));
    try {
      const extracted = await extractYoutubeVideoMp4(
        job.videoId,
        tmpDir,
        env.YT_DLP_PATH,
        (progress) => {
          if (job.status !== 'running') return;
          job.percent = Math.max(job.percent, progress.percent);
          job.stage = progress.stage;
        },
      );
      job.percent = 96;
      job.stage = 'saving';
      const youtubeTitle = extracted.title || job.title;
      const seriesFolder = seriesFolderFromTitle(job.seriesName, youtubeTitle, job.videoId);
      const filename = `${safeBasename(youtubeTitle, job.videoId)}.${job.videoId}.mp4`;
      const dir = join(mediaRoot, folder.dirName, seriesFolder);
      await mkdir(dir, { recursive: true });
      await copyFile(extracted.filePath, join(dir, filename));
      job.filename = filename;
      job.nasPath = `${folder.nasLabel}/${seriesFolder}/${filename}`;
      job.percent = 100;
      job.stage = 'done';
      job.status = 'done';
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  };

  const pump = () => {
    prune();
    while (running < MAX_PARALLEL_DOWNLOADS && waitQueue.length > 0) {
      const jobId = waitQueue.shift();
      if (!jobId) break;
      const job = jobs.get(jobId);
      if (!job || job.status !== 'queued') continue;
      running += 1;
      job.status = 'running';
      job.stage = 'starting';
      job.queuePosition = 0;
      void (async () => {
        try {
          if (job.kind === 'mp3') await runMp3(job);
          else await runMp4(job);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'download_failed';
          job.status = 'failed';
          job.stage = 'failed';
          job.error = classifyYtdlpError(
            message,
            job.kind === 'mp3' ? 'audio_extract_failed' : 'video_extract_failed',
          );
        } finally {
          running -= 1;
          pump();
        }
      })();
    }
  };

  const enqueue = (input: {
    kind: 'mp3' | 'mp4';
    videoId: string;
    title?: string;
    folder?: AdminMediaFolderId;
    folderLabel?: string;
    seriesName?: string;
  }): AdminDownloadJob => {
    prune();
    const job: AdminDownloadJob = {
      jobId: randomUUID(),
      kind: input.kind,
      videoId: input.videoId,
      title: input.title,
      folder: input.folder,
      folderLabel: input.folderLabel,
      seriesName: input.seriesName,
      status: 'queued',
      percent: 0,
      stage: 'queued',
      queuePosition: waitQueue.length + 1,
      createdAt: Date.now(),
    };
    jobs.set(job.jobId, job);
    waitQueue.push(job.jobId);
    pump();
    return publicJob(job);
  };

  return {
    enqueue,
    listJobs,
    getJob: (jobId: string) => {
      const job = jobs.get(jobId);
      return job ? publicJob(job) : undefined;
    },
  };
}

export function registerAdminDownloadRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: ApiEnv; storage: ObjectStorage; audioQueue: Queue },
): void {
  const runner = createJobRunner(deps);

  app.get('/v1/admin/downloads/jobs', async () => ({
    maxParallel: MAX_PARALLEL_DOWNLOADS,
    jobs: runner.listJobs(),
  }));

  app.get<{ Params: { jobId: string } }>('/v1/admin/downloads/jobs/:jobId', async (request, reply) => {
    const job = runner.getJob(request.params.jobId);
    if (!job) return reply.code(404).send({ error: 'not_found' });
    return job;
  });

  app.post<{ Params: { videoId: string }; Body: { title?: string } }>(
    '/v1/admin/youtube/videos/:videoId/audio/download',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }
      const job = runner.enqueue({
        kind: 'mp3',
        videoId,
        title: request.body?.title?.trim() || videoId,
      });
      return reply.code(202).send(job);
    },
  );

  app.post<{ Params: { videoId: string }; Body: { title?: string; folder?: string; series?: string } }>(
    '/v1/admin/youtube/videos/:videoId/video/download',
    async (request, reply) => {
      const videoId = request.params.videoId;
      if (!isValidYoutubeVideoId(videoId)) {
        return reply.code(400).send({ error: 'invalid_video_id' });
      }
      const folderId = parseAdminMediaFolderId(request.body?.folder);
      if (!folderId) {
        return reply.code(400).send({ error: 'invalid_download_folder' });
      }
      const folder = adminMediaFolderById(folderId);
      const job = runner.enqueue({
        kind: 'mp4',
        videoId,
        title: request.body?.title?.trim() || videoId,
        folder: folderId,
        folderLabel: folder.dirName,
        seriesName: request.body?.series?.trim() || undefined,
      });
      return reply.code(202).send(job);
    },
  );
}
