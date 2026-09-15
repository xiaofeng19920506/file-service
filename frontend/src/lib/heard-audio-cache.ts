import { readHeardAudioCacheEnabled } from './heard-audio-cache-preference';

const CACHE_NAME = 'heard-audio-v1';
const INDEX_KEY = 'heard-audio-cache-index';
const MAX_ENTRIES = 40;
/** 播放超过此时长（秒）或进度比例后视为「听过」并写入本机缓存 */
export const HEARD_AUDIO_CACHE_MIN_SECONDS = 20;
export const HEARD_AUDIO_CACHE_MIN_RATIO = 0.35;

type CacheIndexEntry = { videoId: string; at: number };

function cacheRequest(videoId: string): Request {
  return new Request(`https://heard-audio.local/${encodeURIComponent(videoId)}`, {
    method: 'GET',
  });
}

function readIndex(): CacheIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CacheIndexEntry =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as CacheIndexEntry).videoId === 'string' &&
        typeof (item as CacheIndexEntry).at === 'number',
    );
  } catch {
    return [];
  }
}

function writeIndex(entries: CacheIndexEntry[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

function touchIndex(videoId: string): void {
  const now = Date.now();
  const next = [{ videoId, at: now }, ...readIndex().filter((e) => e.videoId !== videoId)].slice(
    0,
    MAX_ENTRIES,
  );
  writeIndex(next);
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function enforceLru(cache: Cache): Promise<void> {
  const index = readIndex();
  if (index.length <= MAX_ENTRIES) return;
  const keep = new Set(index.slice(0, MAX_ENTRIES).map((e) => e.videoId));
  const drop = index.slice(MAX_ENTRIES);
  writeIndex(index.slice(0, MAX_ENTRIES));
  await Promise.all(
    drop.map(async (entry) => {
      if (keep.has(entry.videoId)) return;
      try {
        await cache.delete(cacheRequest(entry.videoId));
      } catch {
        /* ignore */
      }
    }),
  );
}

/** 若本机已有该曲缓存，返回可播放的 blob URL（调用方负责 revoke） */
export async function getHeardAudioCachedObjectUrl(videoId: string): Promise<string | null> {
  if (!videoId || !readHeardAudioCacheEnabled()) return null;
  const cache = await openCache();
  if (!cache) return null;
  try {
    const match = await cache.match(cacheRequest(videoId));
    if (!match || !match.ok) return null;
    const blob = await match.blob();
    if (!blob || blob.size < 1024) return null;
    touchIndex(videoId);
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

const inflight = new Map<string, Promise<void>>();

/** 将已听过的 ready 流写入本机 Cache（按 videoId，不绑 token） */
export function cacheHeardAudio(videoId: string, streamUrl: string): Promise<void> {
  if (!videoId || !streamUrl || !readHeardAudioCacheEnabled()) return Promise.resolve();
  if (streamUrl.startsWith('blob:')) return Promise.resolve();
  const existing = inflight.get(videoId);
  if (existing) return existing;

  const task = (async () => {
    const cache = await openCache();
    if (!cache) return;
    try {
      const hit = await cache.match(cacheRequest(videoId));
      if (hit?.ok) {
        touchIndex(videoId);
        return;
      }
      const res = await fetch(streamUrl, {
        credentials: 'same-origin',
        mode: 'cors',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const contentType = res.headers.get('content-type') ?? 'audio/mpeg';
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 1024) return;
      await cache.put(
        cacheRequest(videoId),
        new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(buffer.byteLength),
          },
        }),
      );
      touchIndex(videoId);
      await enforceLru(cache);
    } catch {
      /* 配额满 / 离线等：静默跳过 */
    }
  })().finally(() => {
    inflight.delete(videoId);
  });

  inflight.set(videoId, task);
  return task;
}

export function shouldCacheHeardProgress(currentTime: number, duration: number): boolean {
  if (currentTime >= HEARD_AUDIO_CACHE_MIN_SECONDS) return true;
  if (Number.isFinite(duration) && duration > 0 && currentTime / duration >= HEARD_AUDIO_CACHE_MIN_RATIO) {
    return true;
  }
  return false;
}

export async function clearHeardAudioCache(): Promise<void> {
  inflight.clear();
  writeIndex([]);
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* ignore */
  }
}

export async function hasHeardAudioCached(videoId: string): Promise<boolean> {
  if (!videoId || !readHeardAudioCacheEnabled()) return false;
  const cache = await openCache();
  if (!cache) return false;
  try {
    const match = await cache.match(cacheRequest(videoId));
    return Boolean(match?.ok);
  } catch {
    return false;
  }
}
