import { describe, expect, it } from 'vitest';
import { signUserToken, verifyUserToken } from './user-token.js';

describe('user token', () => {
  const secret = 'test-secret-at-least-16';

  it('round-trips a valid token', () => {
    const expiresAtUnix = 1_900_000_000;
    const token = signUserToken({
      secret,
      userId: 'user-1',
      email: 'admin@example.com',
      role: 'admin',
      expiresAtUnix,
    });
    expect(verifyUserToken({ secret, token, nowUnix: expiresAtUnix - 1 })).toEqual({
      userId: 'user-1',
      email: 'admin@example.com',
      role: 'admin',
      expiresAtUnix,
    });
  });
});
