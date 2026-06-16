import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { signYoutubeOAuthState, verifyYoutubeOAuthState } from './youtube-oauth-state.js';

describe('youtube oauth state', () => {
  const secret = 'test-secret-at-least-16-chars';

  it('round-trips playlist, web app url, and return hash', () => {
    const token = signYoutubeOAuthState({
      secret,
      userId: 'user-1',
      returnPlaylistId: 'playlist-1',
      returnWebAppUrl: 'https://app.example.com',
      returnHash: '/bulletin',
      expiresAtUnix: 4_000_000_000,
    });
    const claims = verifyYoutubeOAuthState({
      secret,
      token,
      nowUnix: 1,
    });
    expect(claims).toEqual({
      userId: 'user-1',
      returnPlaylistId: 'playlist-1',
      returnWebAppUrl: 'https://app.example.com',
      returnHash: '/bulletin',
      expiresAtUnix: 4_000_000_000,
    });
  });

  it('round-trips playlist and web app url (legacy 6-part)', () => {
    const userId = 'user-1b';
    const playlistId = 'playlist-1b';
    const webApp = 'https://app.example.com';
    const exp = 4_000_000_000;
    const playlistEnc = Buffer.from(playlistId, 'utf8').toString('base64url');
    const webAppEnc = Buffer.from(webApp, 'utf8').toString('base64url');
    const payload = `ytoauth:${userId}:${playlistId}:${webApp}:${exp}`;
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    const token = `ytoauth.${userId}.${playlistEnc}.${webAppEnc}.${exp}.${sig}`;

    const claims = verifyYoutubeOAuthState({ secret, token, nowUnix: 1 });
    expect(claims).toEqual({
      userId,
      returnPlaylistId: playlistId,
      returnWebAppUrl: webApp,
      expiresAtUnix: exp,
    });
  });

  it('supports legacy tokens without web app url', () => {
    const userId = 'user-2';
    const playlistId = 'playlist-2';
    const exp = 4_000_000_000;
    const playlistEnc = Buffer.from(playlistId, 'utf8').toString('base64url');
    const payload = `ytoauth:${userId}:${playlistId}:${exp}`;
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    const token = `ytoauth.${userId}.${playlistEnc}.${exp}.${sig}`;

    const claims = verifyYoutubeOAuthState({
      secret,
      token,
      nowUnix: 1,
    });
    expect(claims?.userId).toBe(userId);
    expect(claims?.returnPlaylistId).toBe(playlistId);
    expect(claims?.returnWebAppUrl).toBeUndefined();
  });
});
