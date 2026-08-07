import { describe, expect, it } from 'vitest';
import {
  signBulletinSectionInviteToken,
  verifyBulletinSectionInviteToken,
} from './bulletin-section-invite-token.js';

describe('bulletin section invite token', () => {
  const secret = 'test-secret';

  it('round-trips valid message invite', () => {
    const expiresAtUnix = Math.floor(Date.now() / 1000) + 3600;
    const token = signBulletinSectionInviteToken({
      secret,
      bulletinId: 'bul-1',
      sectionId: 'message',
      expiresAtUnix,
    });
    const claims = verifyBulletinSectionInviteToken({ secret, token });
    expect(claims).toEqual({
      bulletinId: 'bul-1',
      sectionId: 'message',
      expiresAtUnix,
    });
  });

  it('round-trips valid verse invite', () => {
    const expiresAtUnix = Math.floor(Date.now() / 1000) + 3600;
    const token = signBulletinSectionInviteToken({
      secret,
      bulletinId: 'bul-2',
      sectionId: 'verse_of_week',
      expiresAtUnix,
    });
    const claims = verifyBulletinSectionInviteToken({ secret, token });
    expect(claims?.sectionId).toBe('verse_of_week');
  });

  it('rejects expired and disallowed sections', () => {
    const expired = signBulletinSectionInviteToken({
      secret,
      bulletinId: 'bul-1',
      sectionId: 'message',
      expiresAtUnix: 1,
    });
    expect(verifyBulletinSectionInviteToken({ secret, token: expired, nowUnix: 100 })).toBeNull();

    const badSection = signBulletinSectionInviteToken({
      secret,
      bulletinId: 'bul-1',
      sectionId: 'cover',
      expiresAtUnix: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(verifyBulletinSectionInviteToken({ secret, token: badSection })).toBeNull();
  });
});
