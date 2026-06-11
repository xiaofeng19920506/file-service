import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db/index.js';
import {
  youtubeAudioCache,
  type YoutubeAudioCacheRow,
  type YoutubeAudioCacheStatus,
} from './db/schema.js';
import { isValidYoutubeVideoId } from './youtube-audio-extract.js';

export const YOUTUBE_AUDIO_QUEUE_NAME = 'youtube-audio-extract';

export type YoutubeAudioExtractQueue = {
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

function priorityForOrderIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return (total - index) * 100;
}

export type YoutubeAudioCachePublic = {
  videoId: string;
  status: YoutubeAudioCacheStatus;
  blobId: string | null;
  errorCode: string | null;
};

function normalizeStatus(raw: string): YoutubeAudioCacheStatus {
  if (raw === 'processing' || raw === 'ready' || raw === 'failed') return raw;
  return 'pending';
}

export function serializeAudioCache(row: YoutubeAudioCacheRow): YoutubeAudioCachePublic {
  return {
    videoId: row.youtubeVideoId,
    status: normalizeStatus(row.status),
    blobId: row.blobId,
    errorCode: row.errorCode,
  };
}

export async function getAudioCacheMap(
  db: Db,
  videoIds: string[],
): Promise<Map<string, YoutubeAudioCachePublic>> {
  const ids = [...new Set(videoIds.filter(isValidYoutubeVideoId))];
  const map = new Map<string, YoutubeAudioCachePublic>();
  if (!ids.length) return map;

  const rows = await db
    .select()
    .from(youtubeAudioCache)
    .where(inArray(youtubeAudioCache.youtubeVideoId, ids));

  for (const row of rows) {
    map.set(row.youtubeVideoId, serializeAudioCache(row));
  }
  for (const id of ids) {
    if (!map.has(id)) {
      map.set(id, { videoId: id, status: 'pending', blobId: null, errorCode: null });
    }
  }
  return map;
}

export type EnsureYoutubeAudioJobsOptions = {
  /** 按播放顺序排列的 videoId，越靠前优先级越高 */
  priorityOrder?: string[];
};

export async function ensureYoutubeAudioJobs(
  db: Db,
  queue: YoutubeAudioExtractQueue,
  entries: { videoId: string; title?: string }[],
  options?: EnsureYoutubeAudioJobsOptions,
): Promise<void> {
  const unique = new Map<string, string | undefined>();
  for (const entry of entries) {
    if (!isValidYoutubeVideoId(entry.videoId)) continue;
    if (!unique.has(entry.videoId)) unique.set(entry.videoId, entry.title);
  }
  if (!unique.size) return;

  const orderedUnique: string[] = [];
  for (const id of [
    ...(options?.priorityOrder ?? []),
    ...entries.map((e) => e.videoId),
  ]) {
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
    .from(youtubeAudioCache)
    .where(inArray(youtubeAudioCache.youtubeVideoId, videoIds));
  const existingMap = new Map<string, YoutubeAudioCacheRow>(
    existing.map((row) => [row.youtubeVideoId, row]),
  );

  const now = new Date();
  const sortedVideoIds = [...unique.keys()].sort(
    (a, b) => (priorityByVideoId.get(b) ?? 0) - (priorityByVideoId.get(a) ?? 0),
  );

  for (const videoId of sortedVideoIds) {
    const title = unique.get(videoId);
    const priority = priorityByVideoId.get(videoId) ?? 0;
    const row = existingMap.get(videoId);
    if (row?.status === 'ready' && row.blobId) continue;
    if (row?.status === 'processing') continue;

    if (!row) {
      await db.insert(youtubeAudioCache).values({
        youtubeVideoId: videoId,
        status: 'pending',
        title: title ?? null,
        updatedAt: now,
      });
    } else if (row.status === 'failed') {
      await db
        .update(youtubeAudioCache)
        .set({
          status: 'pending',
          errorCode: null,
          errorDetail: null,
          title: title ?? row.title,
          updatedAt: now,
        })
        .where(eq(youtubeAudioCache.youtubeVideoId, videoId));
    } else if (row.status === 'pending' && title && title !== row.title) {
      await db
        .update(youtubeAudioCache)
        .set({ title, updatedAt: now })
        .where(eq(youtubeAudioCache.youtubeVideoId, videoId));
    }

    await enqueueAudioJob(queue, videoId, title ?? row?.title ?? undefined, priority);
  }
}

/** 提升指定歌曲的缓存优先级（当前播放曲目应排在数组最前） */
export async function prioritizeYoutubeAudioJobs(
  db: Db,
  queue: YoutubeAudioExtractQueue,
  priorityOrder: string[],
  entries?: { videoId: string; title?: string }[],
): Promise<void> {
  const titleById = new Map(entries?.map((e) => [e.videoId, e.title]));
  const uniqueOrder = [...new Set(priorityOrder.filter(isValidYoutubeVideoId))];
  if (!uniqueOrder.length) return;

  await ensureYoutubeAudioJobs(
    db,
    queue,
    uniqueOrder.map((videoId) => ({
      videoId,
      title: titleById.get(videoId),
    })),
    { priorityOrder: uniqueOrder },
  );
}

async function enqueueAudioJob(
  queue: YoutubeAudioExtractQueue,
  videoId: string,
  title?: string,
  priority = 0,
): Promise<void> {
  const jobId = `yt-audio-${videoId}`;
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
    { jobId, priority, removeOnComplete: 100, removeOnFail: 50 },
  );
}
