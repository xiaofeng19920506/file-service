import { describe, expect, it } from 'vitest';
import { signAdminToken, verifyAdminToken } from './admin-token.js';

describe('admin token', () => {
  const secret = 'test-secret-at-least-16';

  it('round-trips a valid token', () => {
    const expiresAtUnix = 1_900_000_000;
    const token = signAdminToken({ secret, expiresAtUnix });
    expect(verifyAdminToken({ secret, token, nowUnix: expiresAtUnix - 1 })).toEqual({
      expiresAtUnix,
    });
  });

  it('rejects expired tokens', () => {
    const expiresAtUnix = 1_000;
    const token = signAdminToken({ secret, expiresAtUnix });
    expect(verifyAdminToken({ secret, token, nowUnix: 2_000 })).toBeNull();
  });
});
