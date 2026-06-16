import { eq } from 'drizzle-orm';
import {
  refreshGoogleAccessToken,
  youtubeOAuthConnections,
  type ApiEnv,
  type Db,
} from '@file-service/shared';

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function resolveOAuthConfig(env: ApiEnv): OAuthConfig | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const redirectUri =
    env.GOOGLE_OAUTH_REDIRECT_URI?.trim()
    || (env.PUBLIC_BASE_URL
      ? `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/youtube/oauth/callback`
      : undefined);
  if (!redirectUri) return null;

  return { clientId, clientSecret, redirectUri };
}

export async function getValidYoutubeAccessToken(
  db: Db,
  oauth: OAuthConfig,
  userId: string,
): Promise<{ accessToken: string } | { error: 'not_connected' | 'refresh_failed' }> {
  const [row] = await db
    .select()
    .from(youtubeOAuthConnections)
    .where(eq(youtubeOAuthConnections.userId, userId));

  if (!row?.refreshToken) return { error: 'not_connected' };

  const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0;
  const stillValid = row.accessToken && expiresAt > Date.now() + 60_000;
  if (stillValid && row.accessToken) {
    return { accessToken: row.accessToken };
  }

  try {
    const refreshed = await refreshGoogleAccessToken({
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      refreshToken: row.refreshToken,
    });
    const accessTokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await db
      .update(youtubeOAuthConnections)
      .set({
        accessToken: refreshed.access_token,
        accessTokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(youtubeOAuthConnections.userId, userId));
    return { accessToken: refreshed.access_token };
  } catch {
    return { error: 'refresh_failed' };
  }
}
