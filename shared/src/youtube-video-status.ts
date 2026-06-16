import { eq } from 'drizzle-orm';
import type { Db } from './db/index.js';
import { blobs } from './db/schema.js';
import type { ObjectStorage } from './storage/types.js';
import type { YoutubeVideoCacheRow } from './db/schema.js';
import {
  DEFAULT_YOUTUBE_VIDEO_STREAMABLE_MIN_BYTES,
} from './youtube-video-storage.js';
import { serializeVideoCache, type YoutubeVideoCachePublic } from './youtube-video-cache.js';
import { getYoutubeVideoDurationSecondsCached } from './youtube.js';

export type YoutubeVideoStreamInfo = {
  cachedBytes: number;
  expectedBytes: number | null;
  partial: boolean;
  streamable: boolean;
};

export async function resolveYoutubeVideoStreamInfo(
  storage: ObjectStorage,
  cache: YoutubeVideoCacheRow,
  blob: { storageKey: string; sizeBytes: number } | null | undefined,
  streamableMinBytes = DEFAULT_YOUTUBE_VIDEO_STREAMABLE_MIN_BYTES,
): Promise<YoutubeVideoStreamInfo> {
  if (!blob || !cache.blobId) {
    return { cachedBytes: 0, expectedBytes: cache.expectedBytes ?? null, partial: false, streamable: false };
  }

  const live = (await storage.statObject(blob.storageKey)) ?? blob.sizeBytes;
  const partial = cache.status === 'processing';
  const streamable =
    cache.status === 'ready'
    || (partial && live >= streamableMinBytes);

  return {
    cachedBytes: live,
    expectedBytes: cache.expectedBytes ?? null,
    partial: partial && streamable,
    streamable,
  };
}

export type YoutubeVideoStatusPayload = YoutubeVideoCachePublic & {
  streamUrl: string | null;
  expiresAt: string | null;
  cachedBytes: number | null;
  expectedBytes: number | null;
  partial: boolean;
  durationSeconds?: number;
};

export async function buildYoutubeVideoStatusPayload(
  db: Db,
  storage: ObjectStorage,
  cache: YoutubeVideoCacheRow | undefined,
  videoId: string,
  buildStreamUrl: (videoId: string) => { streamUrl: string; expiresAt: string },
  streamableMinBytes = DEFAULT_YOUTUBE_VIDEO_STREAMABLE_MIN_BYTES,
): Promise<YoutubeVideoStatusPayload> {
  const durationSeconds = await getYoutubeVideoDurationSecondsCached(videoId);
  const durationField =
    durationSeconds !== null && durationSeconds > 0
      ? { durationSeconds }
      : {};

  const base = cache
    ? serializeVideoCache(cache)
    : { videoId, status: 'pending' as const, blobId: null, errorCode: null };

  if (!cache?.blobId) {
    return {
      ...base,
      ...durationField,
      streamUrl: null,
      expiresAt: null,
      cachedBytes: null,
      expectedBytes: cache?.expectedBytes ?? null,
      partial: false,
    };
  }

  const [blob] = await db.select().from(blobs).where(eq(blobs.id, cache.blobId));
  const info = await resolveYoutubeVideoStreamInfo(storage, cache, blob, streamableMinBytes);

  if (!info.streamable || !blob) {
    return {
      ...base,
      ...durationField,
      streamUrl: null,
      expiresAt: null,
      cachedBytes: info.cachedBytes,
      expectedBytes: info.expectedBytes,
      partial: false,
    };
  }

  const { streamUrl, expiresAt } = buildStreamUrl(videoId);
  return {
    ...base,
    ...durationField,
    streamUrl,
    expiresAt,
    cachedBytes: info.cachedBytes,
    expectedBytes: info.expectedBytes,
    partial: info.partial,
  };
}
