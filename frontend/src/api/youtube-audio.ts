import { apiFetch, parseJson } from './http';

export type YoutubeAudioStatus = {
  videoId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  blobId: string | null;
  errorCode: string | null;
  streamUrl?: string;
  expiresAt?: string;
};

export async function getYoutubeAudioStatus(videoId: string): Promise<YoutubeAudioStatus> {
  const res = await apiFetch(`/v1/youtube/videos/${encodeURIComponent(videoId)}/audio`);
  return parseJson<YoutubeAudioStatus>(res);
}

export async function getYoutubeAudioStreamUrl(videoId: string): Promise<{ url: string; expiresAt: string }> {
  const res = await apiFetch(
    `/v1/youtube/videos/${encodeURIComponent(videoId)}/audio/stream-url`,
    { method: 'POST' },
  );
  return parseJson(res);
}
