import { describe, expect, it } from 'vitest';
import { defaultNextClipStartSec } from './worship-presentation-mode';

describe('defaultNextClipStartSec', () => {
  it('starts one second after previous end (1:00 → 1:01)', () => {
    expect(defaultNextClipStartSec({ startSec: 0, endSec: 60 })).toBe(61);
    expect(defaultNextClipStartSec({ startSec: 61, endSec: 120 })).toBe(121);
  });

  it('falls back when previous has no end', () => {
    expect(defaultNextClipStartSec({ startSec: 30, endSec: null }, 200)).toBe(200);
    expect(defaultNextClipStartSec({ startSec: 30, endSec: null })).toBe(31);
  });
});
