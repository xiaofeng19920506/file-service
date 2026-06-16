import { describe, expect, it } from 'vitest';
import { signPlaylistEditToken, verifyPlaylistEditToken } from './playlist-edit-token.js';

describe('playlist-edit-token', () => {
  const secret = 'test-secret';

  it('round-trips valid token', () => {
    const token = signPlaylistEditToken({
      secret,
      playlistId: 'pl-1',
      bulletinId: 'bu-1',
      expiresAtUnix: 9_999_999_999,
    });
    const claims = verifyPlaylistEditToken({ secret, token });
    expect(claims).toEqual({
      playlistId: 'pl-1',
      bulletinId: 'bu-1',
      expiresAtUnix: 9_999_999_999,
    });
  });

  it('rejects expired token', () => {
    const token = signPlaylistEditToken({
      secret,
      playlistId: 'pl-1',
      bulletinId: 'bu-1',
      expiresAtUnix: 100,
    });
    expect(verifyPlaylistEditToken({ secret, token, nowUnix: 200 })).toBeNull();
  });
});
