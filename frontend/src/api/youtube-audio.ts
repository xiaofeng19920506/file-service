import { apiFetch, parseJson } from './http';

export type YoutubeAudioStatus = {
  videoId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  blobId: string | null;
  errorCode: string | null;
  /** YouTube 原视频时长（秒），预览/缓存未完成时用于显示总时长 */
  durationSeconds?: number;
  streamUrl?: string;
  expiresAt?: string;
  /** 未缓存完成时的即时播放地址（边播边缓存） */
  previewStreamUrl?: string;
  previewExpiresAt?: string;
};

/** 合并进行中的相同请求，避免轮询与切换曲目时重复打 API */
function dedupeByKey<T>(store: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const existing = store.get(key);
  if (existing) return existing;
  const promise = run().finally(() => {
    if (store.get(key) === promise) store.delete(key);
  });
  store.set(key, promise);
  return promise;
}

const statusInflight = new Map<string, Promise<YoutubeAudioStatus>>();
const streamUrlInflight = new Map<string, Promise<{ url: string; expiresAt: string }>>();
let prioritizeInflight: Promise<void> | null = null;
let prioritizeKey = '';

export async function getYoutubeAudioStatus(videoId: string): Promise<YoutubeAudioStatus> {
  return dedupeByKey(statusInflight, videoId, async () => {
    const res = await apiFetch(`/v1/youtube/videos/${encodeURIComponent(videoId)}/audio`);
    return parseJson<YoutubeAudioStatus>(res);
  });
}

export async function getYoutubeAudioStreamUrl(
  videoId: string,
): Promise<{ url: string; expiresAt: string }> {
  return dedupeByKey(streamUrlInflight, videoId, async () => {
    const res = await apiFetch(
      `/v1/youtube/videos/${encodeURIComponent(videoId)}/audio/stream-url`,
      { method: 'POST' },
    );
    return parseJson(res);
  });
}

/** 按播放顺序提升缓存优先级，数组第一项（当前曲目）最先提取 */
export async function prioritizeYoutubeAudioCache(
  videoIds: string[],
  entries?: { videoId: string; title?: string }[],
): Promise<void> {
  const key = videoIds.join('\0');
  if (prioritizeInflight && prioritizeKey === key) return prioritizeInflight;
  prioritizeKey = key;
  prioritizeInflight = (async () => {
    const res = await apiFetch('/v1/youtube/audio/prioritize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds, entries }),
    });
    await parseJson(res);
  })().finally(() => {
    if (prioritizeKey === key) {
      prioritizeInflight = null;
      prioritizeKey = '';
    }
  });
  return prioritizeInflight;
}
