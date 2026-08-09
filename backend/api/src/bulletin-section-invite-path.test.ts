import { describe, expect, it } from 'vitest';
import { parseBulletinSectionInviteRest } from './bulletin-section-invite-path.js';

describe('parseBulletinSectionInviteRest', () => {
  const token = 'bs.abc.def.123.sig';

  it('parses detail / pptx / verse', () => {
    expect(parseBulletinSectionInviteRest(token)).toEqual({ kind: 'detail', token });
    expect(parseBulletinSectionInviteRest(`${token}/pptx`)).toEqual({ kind: 'pptx', token });
    expect(parseBulletinSectionInviteRest(`${token}/verse`)).toEqual({ kind: 'verse', token });
  });

  it('rejects unknown tails', () => {
    expect(parseBulletinSectionInviteRest(`${token}/other`).kind).toBe('unknown');
  });
});
