import { apiFetch, parseJson } from './http';

export type YoutubeOAuthStatus = {
  configured: boolean;
  connected: boolean;
  channelTitle: string | null;
  googleAccountEmail: string | null;
  updatedAt: string | null;
  dataApiReady?: boolean;
  dataApiError?: string | null;
};

export type YoutubeExportResult = {
  youtubePlaylistId: string;
  youtubePlaylistUrl: string;
  itemsAdded: number;
  itemsFailed: number;
  failedVideoIds: string[];
  invalidVideoIds?: string[];
  itemErrors?: Array<{ videoId: string; reason: string }>;
};

export type YoutubePrivacyStatus = 'public' | 'unlisted' | 'private';

export async function fetchYoutubeOAuthStatus(): Promise<YoutubeOAuthStatus> {
  const res = await apiFetch('/v1/youtube/oauth/status');
  return parseJson(res);
}

export async function startYoutubeOAuth(opts?: {
  returnPlaylistId?: string;
  returnHash?: string;
}): Promise<{ url: string }> {
  const params = new URLSearchParams();
  if (opts?.returnPlaylistId) params.set('returnPlaylistId', opts.returnPlaylistId);
  if (opts?.returnHash) params.set('returnHash', opts.returnHash);
  if (typeof window !== 'undefined') {
    params.set('returnUrl', window.location.origin);
  }
  const query = params.toString();
  const res = await apiFetch(`/v1/youtube/oauth/start${query ? `?${query}` : ''}`);
  return parseJson(res);
}

export type YoutubePlaylistSummary = {
  id: string;
  title: string;
  itemCount: number;
  thumbnailUrl: string | null;
};

export async function listUserYoutubePlaylists(pageToken?: string): Promise<{
  playlists: YoutubePlaylistSummary[];
  nextPageToken: string | null;
}> {
  const params = new URLSearchParams();
  if (pageToken) params.set('pageToken', pageToken);
  const query = params.toString();
  const res = await apiFetch(`/v1/youtube/playlists${query ? `?${query}` : ''}`);
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
