import { asc, eq } from 'drizzle-orm';
import {
  buildGoogleOAuthAuthorizeUrl,
  exchangeGoogleOAuthCode,
  exportVideosToYoutubePlaylist,
  fetchYoutubeChannelInfo,
  listUserYoutubePlaylists,
  mapGoogleOAuthExchangeError,
  mapYoutubeApiError,
  playlistItems,
  playlists,
  probeYoutubeDataApiAccess,
  signYoutubeOAuthState,
  verifyYoutubeOAuthState,
  YOUTUBE_OAUTH_SCOPES,
  youtubeOAuthConnections,
  type ApiEnv,
  type Db,
  type YoutubePrivacyStatus,
} from '@file-service/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { resolveWebAppUrl } from './mail.js';
import { getValidYoutubeAccessToken, resolveOAuthConfig } from './youtube-oauth-token.js';

function normalizeWebAppOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function allowedReturnWebAppOrigins(env: ApiEnv, processEnv: NodeJS.ProcessEnv = process.env): Set<string> {
  const allowed = new Set<string>();
  const add = (raw?: string) => {
    const normalized = raw ? normalizeWebAppOrigin(raw) : null;
    if (normalized) allowed.add(normalized);
  };
  add(env.WEB_APP_URL);
  for (const part of processEnv.CORS_ORIGIN?.split(',') ?? []) {
    add(part.trim());
  }
  add('http://localhost:5173');
  add('http://127.0.0.1:5173');
  add('http://localhost:3000');
  return allowed;
}

function resolveReturnWebAppUrl(opts: {
  env: ApiEnv;
  request: FastifyRequest;
  queryReturnUrl?: string;
}): string {
  const fallback = resolveWebAppUrl(opts.env);
  const allowed = allowedReturnWebAppOrigins(opts.env);

  const candidates = [
    opts.queryReturnUrl?.trim(),
    typeof opts.request.headers.referer === 'string' ? opts.request.headers.referer : undefined,
    typeof opts.request.headers.origin === 'string' ? opts.request.headers.origin : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeWebAppOrigin(candidate);
    if (normalized && allowed.has(normalized)) return normalized;
  }

  return fallback;
}

function oauthNotConfiguredReply(reply: import('fastify').FastifyReply) {
  return reply.code(503).send({ error: 'youtube_oauth_not_configured' });
}

async function assertPlaylistAccess(
  db: Db,
  playlistId: string,
  user: { id: string; role: string },
) {
  const [playlist] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
  if (!playlist) return { error: 'not_found' as const, playlist: null };
  if (playlist.createdByUserId !== user.id && user.role !== 'admin') {
    return { error: 'forbidden' as const, playlist: null };
  }
  return { error: null, playlist };
}

function redirectToWebApp(
  webAppUrl: string,
  params: Record<string, string>,
  opts?: { returnHash?: string; returnPlaylistId?: string },
) {
  const search = new URLSearchParams(params);
  if (opts?.returnPlaylistId) search.set('id', opts.returnPlaylistId);
  const base = webAppUrl.replace(/\/$/, '');
  const hashPath = opts?.returnHash?.replace(/^\//, '') || 'playlists';
  return `${base}/#/${hashPath}?${search.toString()}`;
}

/** @deprecated use redirectToWebApp */
function redirectToPlaylists(
  webAppUrl: string,
  params: Record<string, string>,
) {
  return redirectToWebApp(webAppUrl, params);
}

function callbackRedirectWebAppUrl(
  env: ApiEnv,
  state: { returnWebAppUrl?: string } | null,
): string {
  if (state?.returnWebAppUrl) {
    const allowed = allowedReturnWebAppOrigins(env);
    const normalized = normalizeWebAppOrigin(state.returnWebAppUrl);
    if (normalized && allowed.has(normalized)) return normalized;
  }
  return resolveWebAppUrl(env);
}

export function registerYoutubeOAuthRoutes(
  app: FastifyInstance,
  opts: { db: Db; env: ApiEnv },
) {
  const { db, env } = opts;
  const defaultWebAppUrl = resolveWebAppUrl(env);

  app.get('/v1/youtube/oauth/status', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const oauth = resolveOAuthConfig(env);
    if (!oauth) return oauthNotConfiguredReply(reply);

    const [row] = await db
      .select({
        channelTitle: youtubeOAuthConnections.channelTitle,
        googleAccountEmail: youtubeOAuthConnections.googleAccountEmail,
        updatedAt: youtubeOAuthConnections.updatedAt,
      })
      .from(youtubeOAuthConnections)
      .where(eq(youtubeOAuthConnections.userId, user.id));

    let dataApiReady = false;
    let dataApiError: string | null = null;
    if (row) {
      const tokenResult = await getValidYoutubeAccessToken(db, oauth, user.id);
      if ('accessToken' in tokenResult) {
        const probe = await probeYoutubeDataApiAccess(tokenResult.accessToken);
        dataApiReady = probe.ok;
        if (!probe.ok) {
          dataApiError = mapYoutubeApiError(probe.reason);
        }
      } else {
        dataApiError = tokenResult.error === 'not_connected' ? 'youtube_not_connected' : 'youtube_token_refresh_failed';
      }
    }

    return {
      configured: true,
      connected: !!row,
      channelTitle: row?.channelTitle ?? null,
      googleAccountEmail: row?.googleAccountEmail ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      dataApiReady,
      dataApiError,
    };
  });

  app.get<{ Querystring: { returnPlaylistId?: string; returnUrl?: string; returnHash?: string } }>(
    '/v1/youtube/oauth/start',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const oauth = resolveOAuthConfig(env);
      if (!oauth) return oauthNotConfiguredReply(reply);

      const returnPlaylistId = request.query.returnPlaylistId?.trim() || undefined;
      const returnHash = request.query.returnHash?.trim() || undefined;
      const returnWebAppUrl = resolveReturnWebAppUrl({
        env,
        request,
        queryReturnUrl: request.query.returnUrl,
      });
      const state = signYoutubeOAuthState({
        secret: env.DOWNLOAD_HMAC_SECRET,
        userId: user.id,
        returnPlaylistId,
        returnWebAppUrl,
        returnHash,
      });

      const url = buildGoogleOAuthAuthorizeUrl({
        clientId: oauth.clientId,
        redirectUri: oauth.redirectUri,
        state,
      });

      return { url };
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/v1/youtube/oauth/callback',
    async (request, reply) => {
      const oauth = resolveOAuthConfig(env);
      if (!oauth) {
        return reply.redirect(
          redirectToPlaylists(defaultWebAppUrl, { youtube_oauth: 'error', reason: 'not_configured' }),
        );
      }

      if (request.query.error) {
        return reply.redirect(
          redirectToPlaylists(defaultWebAppUrl, {
            youtube_oauth: 'error',
            reason: request.query.error,
          }),
        );
      }

      const code = request.query.code?.trim();
      const stateToken = request.query.state?.trim();
      if (!code || !stateToken) {
        return reply.redirect(
          redirectToPlaylists(defaultWebAppUrl, { youtube_oauth: 'error', reason: 'invalid_callback' }),
        );
      }

      const state = verifyYoutubeOAuthState({
        secret: env.DOWNLOAD_HMAC_SECRET,
        token: stateToken,
      });
      const webAppUrl = callbackRedirectWebAppUrl(env, state);
      if (!state) {
        return reply.redirect(
          redirectToPlaylists(webAppUrl, { youtube_oauth: 'error', reason: 'invalid_state' }),
        );
      }

      try {
        const token = await exchangeGoogleOAuthCode({
          clientId: oauth.clientId,
          clientSecret: oauth.clientSecret,
          redirectUri: oauth.redirectUri,
          code,
        });

        if (!token.refresh_token) {
          return reply.redirect(
            redirectToPlaylists(webAppUrl, {
              youtube_oauth: 'error',
              reason: 'missing_refresh_token',
            }),
          );
        }

        const channel = await fetchYoutubeChannelInfo(token.access_token);
        const accessTokenExpiresAt = new Date(Date.now() + token.expires_in * 1000);
        const now = new Date();

        await db
          .insert(youtubeOAuthConnections)
          .values({
            userId: state.userId,
            refreshToken: token.refresh_token,
            accessToken: token.access_token,
            accessTokenExpiresAt,
            scopes: token.scope ?? YOUTUBE_OAUTH_SCOPES.join(' '),
            channelTitle: channel.channelTitle,
            googleAccountEmail: channel.googleAccountEmail,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: youtubeOAuthConnections.userId,
            set: {
              refreshToken: token.refresh_token,
              accessToken: token.access_token,
              accessTokenExpiresAt,
              scopes: token.scope ?? YOUTUBE_OAUTH_SCOPES.join(' '),
              channelTitle: channel.channelTitle,
              googleAccountEmail: channel.googleAccountEmail,
              updatedAt: now,
            },
          });

        const params: Record<string, string> = { youtube_oauth: 'connected' };
        if (state.returnPlaylistId) params.id = state.returnPlaylistId;
        if (state.returnHash === '/bulletin') params.worship_youtube = '1';
        return reply.redirect(
          redirectToWebApp(webAppUrl, params, {
            returnHash: state.returnHash,
            returnPlaylistId: state.returnPlaylistId,
          }),
        );
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'token_exchange_failed';
        request.log.error({ err: e, redirectUri: oauth.redirectUri }, 'youtube oauth callback failed');
        const reason = mapGoogleOAuthExchangeError(raw);
        return reply.redirect(
          redirectToPlaylists(webAppUrl, { youtube_oauth: 'error', reason }),
        );
      }
    },
  );

  app.delete('/v1/youtube/oauth', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    await db
      .delete(youtubeOAuthConnections)
      .where(eq(youtubeOAuthConnections.userId, user.id));

    return { ok: true };
  });

  app.get<{ Querystring: { pageToken?: string } }>('/v1/youtube/playlists', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const oauth = resolveOAuthConfig(env);
    if (!oauth) return oauthNotConfiguredReply(reply);

    const tokenResult = await getValidYoutubeAccessToken(db, oauth, user.id);
    if ('error' in tokenResult) {
      const code = tokenResult.error === 'not_connected' ? 'youtube_not_connected' : 'youtube_token_refresh_failed';
      return reply.code(tokenResult.error === 'not_connected' ? 400 : 502).send({ error: code });
    }

    try {
      const pageToken = request.query.pageToken?.trim() || undefined;
      const result = await listUserYoutubePlaylists(tokenResult.accessToken, pageToken);
      return result;
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'youtube_api_failed';
      request.log.error(e, 'list youtube playlists failed');
      const code = mapYoutubeApiError(raw);
      const status =
        code === 'youtube_quota_exceeded'
          ? 429
          : code === 'youtube_api_not_enabled' || code === 'youtube_channel_required'
            ? 503
            : 502;
      return reply.code(status).send({ error: code });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { privacyStatus?: YoutubePrivacyStatus; title?: string; description?: string };
  }>('/v1/playlists/:id/export-youtube', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const oauth = resolveOAuthConfig(env);
    if (!oauth) return oauthNotConfiguredReply(reply);

    const access = await assertPlaylistAccess(db, request.params.id, user);
    if (access.error === 'not_found') return reply.code(404).send({ error: 'not_found' });
    if (access.error === 'forbidden') return reply.code(403).send({ error: 'forbidden' });

    const items = await db
      .select({
        youtubeVideoId: playlistItems.youtubeVideoId,
      })
      .from(playlistItems)
      .where(eq(playlistItems.playlistId, request.params.id))
      .orderBy(asc(playlistItems.sortOrder));

    if (!items.length) {
      return reply.code(400).send({ error: 'youtube_playlist_empty' });
    }

    const tokenResult = await getValidYoutubeAccessToken(db, oauth, user.id);
    if ('error' in tokenResult) {
      const code = tokenResult.error === 'not_connected' ? 'youtube_not_connected' : 'youtube_token_refresh_failed';
      return reply.code(tokenResult.error === 'not_connected' ? 400 : 502).send({ error: code });
    }

    const privacyStatus = request.body?.privacyStatus ?? 'unlisted';
    if (privacyStatus !== 'public' && privacyStatus !== 'unlisted' && privacyStatus !== 'private') {
      return reply.code(400).send({ error: 'invalid_privacy_status' });
    }

    const title = request.body?.title?.trim() || access.playlist!.title;
    const description = request.body?.description?.trim() || `Exported from 敬拜诗库 — ${access.playlist!.title}`;

    try {
      const result = await exportVideosToYoutubePlaylist({
        accessToken: tokenResult.accessToken,
        title,
        description,
        privacyStatus,
        videoIds: items.map((item) => item.youtubeVideoId),
        onItemResult: ({ videoId, ok, error }) => {
          if (ok) {
            request.log.info({ videoId, playlistId: request.params.id }, 'youtube export item added');
          } else {
            request.log.warn({ videoId, error }, 'youtube export item failed');
          }
        },
      });

      return {
        youtubePlaylistId: result.youtubePlaylistId,
        youtubePlaylistUrl: result.youtubePlaylistUrl,
        itemsAdded: result.itemsAdded,
        itemsFailed: result.itemsFailed,
        failedVideoIds: result.failedVideoIds,
      };
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'youtube_export_failed';
      request.log.error(e, 'youtube export failed');
      if (raw === 'youtube_playlist_empty' || raw === 'youtube_export_no_items_added') {
        return reply.code(400).send({ error: mapYoutubeApiError(raw) });
      }
      const code = mapYoutubeApiError(raw);
      const status =
        code === 'youtube_quota_exceeded'
          ? 429
          : code === 'youtube_api_not_enabled' || code === 'youtube_channel_required'
            ? 503
            : 502;
      return reply.code(status).send({ error: code });
    }
  });
}
