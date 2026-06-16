import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db/index.js';
import {
  youtubeVideoCache,
  type YoutubeVideoCacheRow,
  type YoutubeVideoCacheStatus,
} from './db/schema.js';
import { isValidYoutubeVideoId } from './youtube-video-extract.js';

export const YOUTUBE_VIDEO_QUEUE_NAME = 'youtube-video-extract';

export const YOUTUBE_VIDEO_PROCESSING_STALE_MS = 30 * 60 * 1000;

export type YoutubeVideoExtractQueue = {
  add(
    name: string,
    data: { videoId: string; title?: string | null },
    opts?: {
      jobId?: string;
      priority?: number;
      removeOnComplete?: number;
      removeOnFail?: number;
    },
  ): Promise<unknown>;
  getJob(
    jobId: string,
  ): Promise<
    | {
        getState(): Promise<string>;
        remove(): Promise<void>;
        changePriority(opts: { priority: number }): Promise<void>;
      }
    | undefined
  >;
};

function isJobAliveInQueue(state: string): boolean {
  return state === 'active' || state === 'waiting' || state === 'delayed' || state === 'prioritized';
}

export async function resolveVideoProcessingJobState(
  queue: YoutubeVideoExtractQueue,
  videoId: string,
): Promise<string | 'missing'> {
  const job = await queue.getJob(`yt-video-${videoId}`);
  if (!job) return 'missing';
  return job.getState();
}

export function shouldResetStuckVideoProcessing(
  row: YoutubeVideoCacheRow,
  jobState: string | 'missing',
  now = Date.now(),
): boolean {
  if (row.status !== 'processing') return false;
  const ageMs = now - row.updatedAt.getTime();
  if (isJobAliveInQueue(jobState)) {
    return ageMs > YOUTUBE_VIDEO_PROCESSING_STALE_MS;
  }
  return true;
}

function priorityForOrderIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return (total - index) * 100;
}

export type YoutubeVideoCachePublic = {
  videoId: string;
  status: YoutubeVideoCacheStatus;
  blobId: string | null;
  errorCode: string | null;
};

function normalizeStatus(raw: string): YoutubeVideoCacheStatus {
  if (raw === 'processing' || raw === 'ready' || raw === 'failed') return raw;
  return 'pending';
}

export function serializeVideoCache(row: YoutubeVideoCacheRow): YoutubeVideoCachePublic {
  return {
    videoId: row.youtubeVideoId,
    status: normalizeStatus(row.status),
    blobId: row.blobId,
    errorCode: row.errorCode,
  };
}

export async function getVideoCacheMap(
  db: Db,
  videoIds: string[],
): Promise<Map<string, YoutubeVideoCachePublic>> {
  const ids = [...new Set(videoIds.filter(isValidYoutubeVideoId))];
  const map = new Map<string, YoutubeVideoCachePublic>();
  if (!ids.length) return map;

  const rows = await db
    .select()
    .from(youtubeVideoCache)
    .where(inArray(youtubeVideoCache.youtubeVideoId, ids));

  for (const row of rows) {
    map.set(row.youtubeVideoId, serializeVideoCache(row));
  }
  for (const id of ids) {
    if (!map.has(id)) {
      map.set(id, { videoId: id, status: 'pending', blobId: null, errorCode: null });
    }
  }
  return map;
}

export async function ensureYoutubeVideoJobs(
  db: Db,
  queue: YoutubeVideoExtractQueue,
  entries: { videoId: string; title?: string }[],
  options?: { priorityOrder?: string[] },
): Promise<void> {
  const unique = new Map<string, string | undefined>();
  for (const entry of entries) {
    if (!isValidYoutubeVideoId(entry.videoId)) continue;
    if (!unique.has(entry.videoId)) unique.set(entry.videoId, entry.title);
  }
  if (!unique.size) return;

  const orderedUnique: string[] = [];
  for (const id of [...(options?.priorityOrder ?? []), ...entries.map((e) => e.videoId)]) {
    if (!isValidYoutubeVideoId(id) || orderedUnique.includes(id)) continue;
    orderedUnique.push(id);
  }
  const priorityByVideoId = new Map<string, number>();
  orderedUnique.forEach((id, index) => {
    priorityByVideoId.set(id, priorityForOrderIndex(index, orderedUnique.length));
  });

  const videoIds = [...unique.keys()];
  const existing = await db
    .select()
    .from(youtubeVideoCache)
    .where(inArray(youtubeVideoCache.youtubeVideoId, videoIds));
  const existingMap = new Map(existing.map((row) => [row.youtubeVideoId, row]));

  const now = new Date();
  const sortedVideoIds = [...unique.keys()].sort(
    (a, b) => (priorityByVideoId.get(b) ?? 0) - (priorityByVideoId.get(a) ?? 0),
  );

  for (const videoId of sortedVideoIds) {
    const title = unique.get(videoId);
    const priority = priorityByVideoId.get(videoId) ?? 0;
    let row = existingMap.get(videoId);
    if (row?.status === 'ready' && row.blobId) continue;

    if (row?.status === 'processing') {
      const jobState = await resolveVideoProcessingJobState(queue, videoId);
      if (!shouldResetStuckVideoProcessing(row, jobState, now.getTime())) continue;
      await db
        .update(youtubeVideoCache)
        .set({
          status: 'failed',
          errorCode: jobState === 'missing' ? 'job_missing' : 'processing_stale',
          errorDetail:
            jobState === 'missing'
              ? 'queue job missing while cache still processing'
              : `processing exceeded ${YOUTUBE_VIDEO_PROCESSING_STALE_MS}ms`,
          updatedAt: now,
        })
        .where(eq(youtubeVideoCache.youtubeVideoId, videoId));
      row = { ...row, status: 'failed' };
    }

    if (!row) {
      await db.insert(youtubeVideoCache).values({
        youtubeVideoId: videoId,
        status: 'pending',
        title: title ?? null,
        updatedAt: now,
      });
    } else if (row.status === 'failed') {
      await db
        .update(youtubeVideoCache)
        .set({
          status: 'pending',
          errorCode: null,
          errorDetail: null,
          title: title ?? row.title,
          updatedAt: now,
        })
        .where(eq(youtubeVideoCache.youtubeVideoId, videoId));
    } else if (row.status === 'pending' && title && title !== row.title) {
      await db
        .update(youtubeVideoCache)
        .set({ title, updatedAt: now })
        .where(eq(youtubeVideoCache.youtubeVideoId, videoId));
    }

    await enqueueVideoJob(queue, videoId, title ?? row?.title ?? undefined, priority);
  }
}

export async function prioritizeYoutubeVideoJobs(
  db: Db,
  queue: YoutubeVideoExtractQueue,
  priorityOrder: string[],
  entries?: { videoId: string; title?: string }[],
): Promise<void> {
  const titleById = new Map(entries?.map((e) => [e.videoId, e.title]));
  const uniqueOrder = [...new Set(priorityOrder.filter(isValidYoutubeVideoId))];
  if (!uniqueOrder.length) return;

  await ensureYoutubeVideoJobs(
    db,
    queue,
    uniqueOrder.map((videoId) => ({
      videoId,
      title: titleById.get(videoId),
    })),
    { priorityOrder: uniqueOrder },
  );
}

/** VIP 搜索页：按相关度预缓存前 N 条结果 */
export const YOUTUBE_SEARCH_VIDEO_PREFETCH_COUNT = 10;

export type YoutubeSearchPrefetchEntry = {
  videoId: string;
  title: string;
  relevanceScore?: number;
};

export function topSearchResultsForVideoPrefetch(
  results: YoutubeSearchPrefetchEntry[],
  limit = YOUTUBE_SEARCH_VIDEO_PREFETCH_COUNT,
): { videoId: string; title: string }[] {
  const sorted = [...results].sort(
    (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0),
  );
  const seen = new Set<string>();
  const picked: { videoId: string; title: string }[] = [];
  for (const row of sorted) {
    if (!isValidYoutubeVideoId(row.videoId) || seen.has(row.videoId)) continue;
    seen.add(row.videoId);
    picked.push({ videoId: row.videoId, title: row.title });
    if (picked.length >= limit) break;
  }
  return picked;
}

export async function prefetchYoutubeVideosFromSearch(
  db: Db,
  queue: YoutubeVideoExtractQueue,
  results: YoutubeSearchPrefetchEntry[],
  limit = YOUTUBE_SEARCH_VIDEO_PREFETCH_COUNT,
): Promise<void> {
  const top = topSearchResultsForVideoPrefetch(results, limit);
  if (!top.length) return;
  await prioritizeYoutubeVideoJobs(
    db,
    queue,
    top.map((e) => e.videoId),
    top,
  );
}

async function enqueueVideoJob(
  queue: YoutubeVideoExtractQueue,
  videoId: string,
  title?: string,
  priority = 0,
): Promise<void> {
  const jobId = `yt-video-${videoId}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'active') return;
    if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
      await existing.changePriority({ priority });
      return;
    }
    await existing.remove();
  }
  await queue.add(
    'extract',
    { videoId, title: title ?? null },
    { jobId, priority, removeOnComplete: 50, removeOnFail: 30 },
  );
}
