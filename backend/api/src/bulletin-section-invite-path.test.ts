import { describe, expect, it } from 'vitest';
import { parseBulletinSectionInviteRest } from './bulletin-section-invite-path.js';

describe('parseBulletinSectionInviteRest', () => {
  const token = 'bs.abc.def.123.sig';

  it('parses detail / pptx / verse / preview', () => {
    expect(parseBulletinSectionInviteRest(token)).toEqual({ kind: 'detail', token });
    expect(parseBulletinSectionInviteRest(`${token}/pptx`)).toEqual({ kind: 'pptx', token });
    expect(parseBulletinSectionInviteRest(`${token}/verse`)).toEqual({ kind: 'verse', token });
    expect(parseBulletinSectionInviteRest(`${token}/preview/2.png`)).toEqual({
      kind: 'previewSlide',
      token,
      slide: 2,
    });
  });

  it('rejects unknown tails', () => {
    expect(parseBulletinSectionInviteRest(`${token}/other`).kind).toBe('unknown');
    expect(parseBulletinSectionInviteRest(`${token}/preview/0.png`).kind).toBe('unknown');
  });
});