import { readHeardAudioCacheEnabled } from './heard-audio-cache-preference';

/** localStorage 只存索引；音频本体在设备磁盘（OPFS / IndexedDB） */
export const HEARD_AUDIO_DISK_INDEX_KEY = 'heard-audio-disk-index';
export const HEARD_AUDIO_DISK_EVENT = 'heard-audio-disk-change';

const OPFS_DIR = 'heard-audio';
const IDB_NAME = 'heard-audio-disk';
const IDB_STORE = 'tracks';
const IDB_VERSION = 1;
const MAX_ENTRIES = 40;
const OLD_CACHE_NAME = 'heard-audio-v1';

/** 播放超过此时长（秒）或进度比例后视为「听过」并写入设备磁盘 */
export const HEARD_AUDIO_CACHE_MIN_SECONDS = 8;
export const HEARD_AUDIO_CACHE_MIN_RATIO = 0.25;

export type HeardAudioDiskEntry = {
  videoId: string;
  at: number;
  bytes: number;
  backend: 'opfs' | 'idb';
};

function emitDiskChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HEARD_AUDIO_DISK_EVENT));
}

export function readHeardAudioDiskIndex(): HeardAudioDiskEntry[] {
  try {
    const raw = localStorage.getItem(HEARD_AUDIO_DISK_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HeardAudioDiskEntry => {
      if (!item || typeof item !== 'object') return false;
      const e = item as HeardAudioDiskEntry;
      return (
        typeof e.videoId === 'string' &&
        typeof e.at === 'number' &&
        typeof e.bytes === 'number' &&
        (e.backend === 'opfs' || e.backend === 'idb')
      );
    });
  } catch {
    return [];
  }
}

function writeHeardAudioDiskIndex(entries: HeardAudioDiskEntry[]): void {
  try {
    localStorage.setItem(HEARD_AUDIO_DISK_INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
  emitDiskChange();
}

function upsertIndex(entry: HeardAudioDiskEntry): HeardAudioDiskEntry[] {
  const next = [entry, ...readHeardAudioDiskIndex().filter((e) => e.videoId !== entry.videoId)].slice(
    0,
    MAX_ENTRIES,
  );
  writeHeardAudioDiskIndex(next);
  return next;
}

/** 把绝对 API 地址收成同源相对路径，便于本机 fetch 后写入磁盘 */
export function toSameOriginStreamUrl(streamUrl: string): string {
  if (!streamUrl || streamUrl.startsWith('blob:')) return streamUrl;
  if (streamUrl.startsWith('/')) return streamUrl;
  try {
    const parsed = new URL(
      streamUrl,
      typeof window !== 'undefined' ? window.location.href : 'http://localhost',
    );
    if (parsed.pathname.startsWith('/v1/')) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* fall through */
  }
  return streamUrl;
}

async function ensurePersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
}

function supportsOpfs(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

async function getOpfsDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsOpfs()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create });
  } catch {
    return null;
  }
}

function fileNameFor(videoId: string): string {
  return `${encodeURIComponent(videoId)}.mp3`;
}

async function writeOpfs(videoId: string, buffer: ArrayBuffer): Promise<boolean> {
  const dir = await getOpfsDir(true);
  if (!dir) return false;
  try {
    const handle = await dir.getFileHandle(fileNameFor(videoId), { create: true });
    const writable = await handle.createWritable();
    await writable.write(buffer);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function readOpfsBlob(videoId: string): Promise<Blob | null> {
  const dir = await getOpfsDir(false);
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(fileNameFor(videoId));
    const file = await handle.getFile();
    if (!file || file.size < 1024) return null;
    return file;
  } catch {
    return null;
  }
}

async function deleteOpfs(videoId: string): Promise<void> {
  const dir = await getOpfsDir(false);
  if (!dir) return;
  try {
    await dir.removeEntry(fileNameFor(videoId));
  } catch {
    /* ignore */
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'videoId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb_open_failed'));
  });
}

async function writeIdb(videoId: string, buffer: ArrayBuffer, contentType: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({
        videoId,
        blob: new Blob([buffer], { type: contentType || 'audio/mpeg' }),
        at: Date.now(),
        bytes: buffer.byteLength,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb_write_failed'));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

async function readIdbBlob(videoId: string): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openIdb();
    const row = await new Promise<{ blob?: Blob } | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(videoId);
      req.onsuccess = () => resolve(req.result as { blob?: Blob } | undefined);
      req.onerror = () => reject(req.error ?? new Error('idb_read_failed'));
    });
    db.close();
    const blob = row?.blob;
    if (!blob || blob.size < 1024) return null;
    return blob;
  } catch {
    return null;
  }
}

async function deleteIdb(videoId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(videoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb_delete_failed'));
    });
    db.close();
  } catch {
    /* ignore */
  }
}

async function enforceLru(index: HeardAudioDiskEntry[]): Promise<void> {
  if (index.length <= MAX_ENTRIES) return;
  const keep = index.slice(0, MAX_ENTRIES);
  const drop = index.slice(MAX_ENTRIES);
  writeHeardAudioDiskIndex(keep);
  await Promise.all(
    drop.map(async (entry) => {
      await deleteOpfs(entry.videoId);
      await deleteIdb(entry.videoId);
    }),
  );
}

/** 若本机磁盘已有该曲，返回可播放的 blob URL（调用方负责 revoke） */
export async function getHeardAudioCachedObjectUrl(videoId: string): Promise<string | null> {
  if (!videoId || !readHeardAudioCacheEnabled()) return null;
  try {
    const fromOpfs = await readOpfsBlob(videoId);
    if (fromOpfs) {
      const existing = readHeardAudioDiskIndex().find((e) => e.videoId === videoId);
      upsertIndex({
        videoId,
        at: Date.now(),
        bytes: fromOpfs.size,
        backend: existing?.backend ?? 'opfs',
      });
      return URL.createObjectURL(fromOpfs);
    }
    const fromIdb = await readIdbBlob(videoId);
    if (fromIdb) {
      upsertIndex({
        videoId,
        at: Date.now(),
        bytes: fromIdb.size,
        backend: 'idb',
      });
      return URL.createObjectURL(fromIdb);
    }
  } catch {
    return null;
  }
  return null;
}

const inflight = new Map<string, Promise<void>>();

/** 将听过的 ready 流写入用户设备磁盘（OPFS 优先，IndexedDB 兜底） */
export function cacheHeardAudio(videoId: string, streamUrl: string): Promise<void> {
  if (!videoId || !streamUrl || !readHeardAudioCacheEnabled()) return Promise.resolve();
  if (streamUrl.startsWith('blob:')) return Promise.resolve();

  const existing = inflight.get(videoId);
  if (existing) return existing;

  const task = (async () => {
    try {
      const already = readHeardAudioDiskIndex().some((e) => e.videoId === videoId);
      if (already) {
        const opfsHit = await readOpfsBlob(videoId);
        const idbHit = opfsHit ? null : await readIdbBlob(videoId);
        if (opfsHit || idbHit) {
          upsertIndex({
            videoId,
            at: Date.now(),
            bytes: (opfsHit ?? idbHit)!.size,
            backend: opfsHit ? 'opfs' : 'idb',
          });
          return;
        }
      }

      await ensurePersistentStorage();
      const url = toSameOriginStreamUrl(streamUrl);
      const res = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) return;

      const contentType = res.headers.get('content-type') ?? 'audio/mpeg';
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 1024) return;

      let backend: 'opfs' | 'idb' | null = null;
      if (await writeOpfs(videoId, buffer)) {
        backend = 'opfs';
      } else if (await writeIdb(videoId, buffer, contentType)) {
        backend = 'idb';
      }
      if (!backend) return;

      const next = upsertIndex({
        videoId,
        at: Date.now(),
        bytes: buffer.byteLength,
        backend,
      });
      await enforceLru(next);
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
  if (
    Number.isFinite(duration) &&
    duration > 0 &&
    currentTime / duration >= HEARD_AUDIO_CACHE_MIN_RATIO
  ) {
    return true;
  }
  return false;
}

export async function clearHeardAudioCache(): Promise<void> {
  inflight.clear();
  const index = readHeardAudioDiskIndex();
  writeHeardAudioDiskIndex([]);
  await Promise.all(
    index.map(async (entry) => {
      await deleteOpfs(entry.videoId);
      await deleteIdb(entry.videoId);
    }),
  );
  try {
    const dir = await getOpfsDir(false);
    if (dir) {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(OPFS_DIR, { recursive: true });
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(IDB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== 'undefined') {
      await caches.delete(OLD_CACHE_NAME);
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('heard-audio-cache-index');
  } catch {
    /* ignore */
  }
}

export async function hasHeardAudioCached(videoId: string): Promise<boolean> {
  if (!videoId || !readHeardAudioCacheEnabled()) return false;
  if (await readOpfsBlob(videoId)) return true;
  if (await readIdbBlob(videoId)) return true;
  return false;
}

export function getHeardAudioDiskStats(): { count: number; bytes: number } {
  const index = readHeardAudioDiskIndex();
  return {
    count: index.length,
    bytes: index.reduce((sum, e) => sum + (Number.isFinite(e.bytes) ? e.bytes : 0), 0),
  };
}
