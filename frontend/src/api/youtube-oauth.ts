import { apiFetch, parseJson } from './http';

export type YoutubeOAuthStatus = {
  configured: boolean;
  connected: boolean;
  channelTitle: string | null;
  googleAccountEmail: string | null;
  updatedAt: string | null;
};

export type YoutubeExportResult = {
  youtubePlaylistId: string;
  youtubePlaylistUrl: string;
  itemsAdded: number;
};

export type YoutubePrivacyStatus = 'public' | 'unlisted' | 'private';

export async function fetchYoutubeOAuthStatus(): Promise<YoutubeOAuthStatus> {
  const res = await apiFetch('/v1/youtube/oauth/status');
  return parseJson(res);
}

export async function startYoutubeOAuth(returnPlaylistId?: string): Promise<{ url: string }> {
  const query = returnPlaylistId
    ? `?returnPlaylistId=${encodeURIComponent(returnPlaylistId)}`
    : '';
  const res = await apiFetch(`/v1/youtube/oauth/start${query}`);
  return parseJson(res);
}

export async function disconnectYoutubeOAuth(): Promise<void> {
  const res = await apiFetch('/v1/youtube/oauth', { method: 'DELETE' });
  await parseJson(res);
}

export async function exportPlaylistToYoutube(
  playlistId: string,
  body?: {
    privacyStatus?: YoutubePrivacyStatus;
    title?: string;
    description?: string;
  },
): Promise<YoutubeExportResult> {
  const res = await apiFetch(`/v1/playlists/${encodeURIComponent(playlistId)}/export-youtube`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return parseJson(res);
}
