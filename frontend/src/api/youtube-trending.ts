import { apiFetch, parseJson } from './http';

export type TrendingSong = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  playCount: number;
};

export type TrendingScope = 'today' | 'all_time' | 'popular';

export type TrendingSongsResponse = {
  scope: TrendingScope;
  songs: TrendingSong[];
};

export async function fetchTrendingYoutubeSongs(limit = 10): Promise<TrendingSongsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await apiFetch(`/v1/youtube/trending?${params}`);
  return parseJson<TrendingSongsResponse>(res);
}

const RECORD_PLAY_DEDUPE_MS = 5 * 60 * 1000;
let lastRecorded: { videoId: string; at: number } | null = null;

export async function recordYoutubePlay(input: {
  videoId: string;
  title: string;
  channelTitle?: string | null;
}): Promise<void> {
  const videoId = input.videoId.trim();
  const title = input.title.trim();
  if (!videoId || !title) return;

  const now = Date.now();
  if (lastRecorded?.videoId === videoId && now - lastRecorded.at < RECORD_PLAY_DEDUPE_MS) {
    return;
  }
  lastRecorded = { videoId, at: now };

  const res = await apiFetch('/v1/youtube/plays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      title,
      channelTitle: input.channelTitle ?? null,
    }),
  });
  await parseJson<{ ok: boolean }>(res);
}
