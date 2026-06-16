import { normalizeYoutubeVideoIds } from './youtube.js';

export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

export type YoutubePrivacyStatus = 'public' | 'unlisted' | 'private';

export type YoutubeExportItemError = {
  videoId: string;
  reason: string;
};

export type YoutubeExportResult = {
  youtubePlaylistId: string;
  youtubePlaylistUrl: string;
  itemsAdded: number;
  itemsFailed: number;
  failedVideoIds: string[];
  invalidVideoIds: string[];
  itemErrors: YoutubeExportItemError[];
};

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export type YoutubeConnectionInfo = {
  googleAccountEmail: string | null;
  channelTitle: string | null;
};

export type YoutubePlaylistSummary = {
  id: string;
  title: string;
  itemCount: number;
  thumbnailUrl: string | null;
};

const SKIPPED_OAUTH_VIDEO_TITLES = new Set([
  'Private video',
  'Deleted video',
  '已设为私享',
  '私人视频',
  '已删除的视频',
]);

export async function listUserYoutubePlaylists(
  accessToken: string,
  pageToken?: string,
): Promise<{ playlists: YoutubePlaylistSummary[]; nextPageToken: string | null }> {
  const query = new URLSearchParams({
    part: 'snippet,contentDetails',
    mine: 'true',
    maxResults: '50',
  });
  if (pageToken) query.set('pageToken', pageToken);

  const data = await youtubeApiRequest<{
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        thumbnails?: { default?: { url?: string }; medium?: { url?: string } };
      };
      contentDetails?: { itemCount?: number };
    }>;
    nextPageToken?: string;
  }>(accessToken, `/playlists?${query.toString()}`, { method: 'GET' });

  const playlists = (data.items ?? [])
    .map((row) => {
      const id = row.id?.trim();
      if (!id) return null;
      const title = row.snippet?.title?.trim() || 'Untitled playlist';
      const thumb =
        row.snippet?.thumbnails?.medium?.url
        ?? row.snippet?.thumbnails?.default?.url
        ?? null;
      return {
        id,
        title,
        itemCount: row.contentDetails?.itemCount ?? 0,
        thumbnailUrl: thumb,
      };
    })
    .filter((row): row is YoutubePlaylistSummary => row !== null);

  return {
    playlists,
    nextPageToken: data.nextPageToken?.trim() || null,
  };
}

export async function fetchOauthYoutubePlaylistItems(
  accessToken: string,
  playlistId: string,
): Promise<Array<{ videoId: string; title: string }>> {
  const items: Array<{ videoId: string; title: string }> = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({
      part: 'snippet',
      playlistId,
      maxResults: '50',
    });
    if (pageToken) query.set('pageToken', pageToken);

    const data = await youtubeApiRequest<{
      items?: Array<{
        snippet?: {
          title?: string;
          resourceId?: { videoId?: string };
        };
      }>;
      nextPageToken?: string;
    }>(accessToken, `/playlistItems?${query.toString()}`, { method: 'GET' });

    for (const row of data.items ?? []) {
      const videoId = row.snippet?.resourceId?.videoId?.trim();
      const title = row.snippet?.title?.trim();
      if (!videoId || !title) continue;
      if (SKIPPED_OAUTH_VIDEO_TITLES.has(title)) continue;
      items.push({ videoId, title });
    }

    pageToken = data.nextPageToken?.trim() || undefined;
  } while (pageToken);

  return items;
}

export function buildGoogleOAuthAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: YOUTUBE_OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleOAuthCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await res.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? 'google_oauth_token_failed');
  }
  if (!data.access_token) {
    throw new Error('google_oauth_token_failed');
  }
  return data;
}

/** 将 Google OAuth token 交换错误映射为 API 错误码 */
export function mapGoogleOAuthExchangeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('redirect_uri_mismatch')) return 'oauth_redirect_uri_mismatch';
  if (lower.includes('invalid_client')) return 'oauth_invalid_client';
  if (lower.includes('invalid_grant')) return 'oauth_invalid_grant';
  return 'token_exchange_failed';
}

export async function refreshGoogleAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await res.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? 'google_oauth_refresh_failed');
  }
  if (!data.access_token) {
    throw new Error('google_oauth_refresh_failed');
  }
  return data;
}

type YoutubeApiErrorBody = {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};

function throwYoutubeApiError(data: YoutubeApiErrorBody, status: number): never {
  const reason = data.error?.errors?.[0]?.reason?.trim();
  const message = data.error?.message?.trim();
  throw new Error(reason || message || `youtube_api_failed:${status}`);
}

async function youtubeApiRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  const url = path.startsWith('https://')
    ? path
    : `https://www.googleapis.com/youtube/v3${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const data = (await res.json()) as T & YoutubeApiErrorBody;
  if (!res.ok) {
    throwYoutubeApiError(data, res.status);
  }
  return data;
}

/** 检查 OAuth 项目是否已启用 YouTube Data API v3 */
export async function probeYoutubeDataApiAccess(
  accessToken: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await youtubeApiRequest(
      accessToken,
      '/playlists?part=id&mine=true&maxResults=1',
      { method: 'GET' },
    );
    return { ok: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'youtube_api_failed';
    return { ok: false, reason };
  }
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email?.trim() || null;
  } catch {
    return null;
  }
}

export async function fetchYoutubeChannelInfo(accessToken: string): Promise<YoutubeConnectionInfo> {
  const [channelData, googleAccountEmail] = await Promise.all([
    youtubeApiRequest<{
      items?: Array<{
        snippet?: { title?: string };
      }>;
    }>(accessToken, '/channels?part=snippet&mine=true', { method: 'GET' }),
    fetchGoogleUserEmail(accessToken),
  ]);

  const channel = channelData.items?.[0];
  return {
    googleAccountEmail,
    channelTitle: channel?.snippet?.title?.trim() ?? null,
  };
}

export function mapYoutubeApiError(message: string): string {
  if (message === 'youtube_export_no_items_added') return 'youtube_export_no_items_added';
  const lower = message.toLowerCase();
  if (
    lower.includes('accessnotconfigured')
    || lower.includes('has not been used in project')
    || lower.includes('it is disabled')
  ) {
    return 'youtube_api_not_enabled';
  }
  if (lower.includes('youtubesignuprequired')) return 'youtube_channel_required';
  if (lower.includes('quota') || lower.includes('dailylimitexceeded')) return 'youtube_quota_exceeded';
  if (lower.includes('insufficientpermissions') || lower.includes('forbidden')) {
    return 'youtube_insufficient_permissions';
  }
  if (lower.includes('playlistnotfound')) return 'youtube_playlist_not_found';
  if (lower.includes('videonotfound')) return 'youtube_video_not_found';
  return 'youtube_export_failed';
}

export async function createYoutubePlaylist(opts: {
  accessToken: string;
  title: string;
  description?: string;
  privacyStatus: YoutubePrivacyStatus;
}): Promise<{ playlistId: string; url: string }> {
  const data = await youtubeApiRequest<{
    id?: string;
    snippet?: { title?: string };
  }>(opts.accessToken, '/playlists?part=snippet,status', {
    method: 'POST',
    body: JSON.stringify({
      snippet: {
        title: opts.title,
        description: opts.description ?? '',
      },
      status: {
        privacyStatus: opts.privacyStatus,
      },
    }),
  });

  if (!data.id) throw new Error('youtube_playlist_create_failed');
  return {
    playlistId: data.id,
    url: `https://www.youtube.com/playlist?list=${data.id}`,
  };
}

export async function deleteYoutubePlaylist(accessToken: string, playlistId: string): Promise<void> {
  await youtubeApiRequest(
    accessToken,
    `/playlists?id=${encodeURIComponent(playlistId)}`,
    { method: 'DELETE' },
  );
}

export async function addVideoToYoutubePlaylist(opts: {
  accessToken: string;
  playlistId: string;
  videoId: string;
}): Promise<void> {
  await youtubeApiRequest(
    opts.accessToken,
    '/playlistItems?part=snippet',
    {
      method: 'POST',
      body: JSON.stringify({
        snippet: {
          playlistId: opts.playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId: opts.videoId,
          },
        },
      }),
    },
  );
}

export async function exportVideosToYoutubePlaylist(opts: {
  accessToken: string;
  title: string;
  description?: string;
  privacyStatus: YoutubePrivacyStatus;
  videoIds: string[];
  onItemResult?: (result: { videoId: string; ok: boolean; error?: string }) => void;
}): Promise<YoutubeExportResult> {
  const { valid, invalid } = normalizeYoutubeVideoIds(opts.videoIds);
  if (!valid.length) {
    throw new Error('youtube_playlist_empty');
  }

  const created = await createYoutubePlaylist({
    accessToken: opts.accessToken,
    title: opts.title,
    description: opts.description,
    privacyStatus: opts.privacyStatus,
  });

  const failedVideoIds = [...invalid];
  const itemErrors: YoutubeExportItemError[] = invalid.map((videoId) => ({
    videoId,
    reason: 'invalid_video_id',
  }));
  let itemsAdded = 0;

  for (const videoId of valid) {
    try {
      await addVideoToYoutubePlaylist({
        accessToken: opts.accessToken,
        playlistId: created.playlistId,
        videoId,
      });
      itemsAdded += 1;
      opts.onItemResult?.({ videoId, ok: true });
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'youtube_api_failed';
      failedVideoIds.push(videoId);
      itemErrors.push({ videoId, reason });
      opts.onItemResult?.({ videoId, ok: false, error: reason });
    }
  }

  if (itemsAdded === 0) {
    try {
      await deleteYoutubePlaylist(opts.accessToken, created.playlistId);
    } catch {
      // ignore cleanup failure
    }
    throw new Error('youtube_export_no_items_added');
  }

  return {
    youtubePlaylistId: created.playlistId,
    youtubePlaylistUrl: created.url,
    itemsAdded,
    itemsFailed: failedVideoIds.length,
    failedVideoIds,
    invalidVideoIds: invalid,
    itemErrors,
  };
}
