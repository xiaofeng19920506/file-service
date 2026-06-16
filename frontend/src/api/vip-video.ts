import { apiFetch, parseJson } from './http';

export type VipVideoItemStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type VipPlaylistItem = {
  id: string;
  title: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  video: {
    status: VipVideoItemStatus;
    errorCode: string | null;
    streamUrl: string | null;
    expiresAt: string | null;
  };
};

export type VipPlaylistResponse = {
  playlist: { id: string; title: string };
  items: VipPlaylistItem[];
};

export async function fetchVipPlaylist(): Promise<VipPlaylistResponse> {
  const res = await apiFetch('/v1/vip/playlist');
  return parseJson(res);
}

export async function prioritizeVipVideos(
  entries: { videoId: string; title?: string }[],
): Promise<void> {
  const res = await apiFetch('/v1/youtube/video/prioritize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  await parseJson(res);
}

export type YoutubeVideoStatus = {
  videoId: string;
  status: VipVideoItemStatus;
  streamUrl: string | null;
  expiresAt: string | null;
  errorCode: string | null;
  cachedBytes: number | null;
  expectedBytes: number | null;
  partial: boolean;
  durationSeconds?: number;
};

export async function fetchYoutubeVideoStatus(videoId: string): Promise<YoutubeVideoStatus> {
  const res = await apiFetch(`/v1/youtube/videos/${encodeURIComponent(videoId)}/video`);
  return parseJson(res);
}

export async function fetchYoutubeVideoStatuses(videoIds: string[]): Promise<YoutubeVideoStatus[]> {
  const ids = [...new Set(videoIds.filter(Boolean))].slice(0, 20);
  if (!ids.length) return [];
  const res = await apiFetch('/v1/youtube/video/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoIds: ids }),
  });
  const data = await parseJson<{ items: YoutubeVideoStatus[] }>(res);
  return data.items;
}
