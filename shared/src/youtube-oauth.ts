export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

export type YoutubePrivacyStatus = 'public' | 'unlisted' | 'private';

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

  const data = (await res.json()) as T & { error?: { message?: string; errors?: Array<{ reason?: string }> } };
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    const message = data.error?.message ?? reason ?? 'youtube_api_failed';
    throw new Error(message);
  }
  return data;
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
  const lower = message.toLowerCase();
  if (lower.includes('quota') || lower.includes('dailylimitexceeded')) return 'youtube_quota_exceeded';
  if (lower.includes('insufficientpermissions') || lower.includes('forbidden')) {
    return 'youtube_insufficient_permissions';
  }
  if (lower.includes('playlistnotfound')) return 'youtube_playlist_not_found';
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
}): Promise<{ youtubePlaylistId: string; youtubePlaylistUrl: string; itemsAdded: number }> {
  const uniqueIds = [...new Set(opts.videoIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    throw new Error('youtube_playlist_empty');
  }

  const created = await createYoutubePlaylist({
    accessToken: opts.accessToken,
    title: opts.title,
    description: opts.description,
    privacyStatus: opts.privacyStatus,
  });

  let itemsAdded = 0;
  for (const videoId of uniqueIds) {
    await addVideoToYoutubePlaylist({
      accessToken: opts.accessToken,
      playlistId: created.playlistId,
      videoId,
    });
    itemsAdded += 1;
  }

  return {
    youtubePlaylistId: created.playlistId,
    youtubePlaylistUrl: created.url,
    itemsAdded,
  };
}
