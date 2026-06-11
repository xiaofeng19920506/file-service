import { describe, expect, it } from 'vitest';
import { signPlaylistShareToken, verifyPlaylistShareToken } from './playlist-share-token.js';

describe('playlist-share-token', () => {
  const secret = 'test-secret-at-least-16-chars';

  it('round-trips a valid token', () => {
    const expiresAtUnix = 1_900_000_000;
    const token = signPlaylistShareToken({
      secret,
      playlistId: '550e8400-e29b-41d4-a716-446655440000',
      expiresAtUnix,
    });
    const verified = verifyPlaylistShareToken({
      secret,
      token,
      nowUnix: expiresAtUnix - 1,
    });
    expect(verified).toEqual({
      playlistId: '550e8400-e29b-41d4-a716-446655440000',
      expiresAtUnix,
    });
  });

  it('rejects expired tokens', () => {
    const expiresAtUnix = 1_000;
    const token = signPlaylistShareToken({
      secret,
      playlistId: 'abc',
      expiresAtUnix,
    });
    expect(
      verifyPlaylistShareToken({ secret, token, nowUnix: expiresAtUnix + 1 }),
    ).toBeNull();
  });
});
