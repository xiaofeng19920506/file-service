import { describe, expect, it } from 'vitest';
import {
  canAddNextClipSegment,
  defaultNextClipStartSec,
} from './playlist-play-clips';

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

describe('canAddNextClipSegment', () => {
  it('blocks when previous segment already reaches the end', () => {
    expect(canAddNextClipSegment({ startSec: 60, endSec: null }, 200)).toBe(false);
    expect(canAddNextClipSegment({ startSec: 60, endSec: 200 }, 200)).toBe(false);
    expect(canAddNextClipSegment({ startSec: 199, endSec: 200 }, 200)).toBe(false);
  });

  it('allows when there is at least one second left', () => {
    expect(canAddNextClipSegment({ startSec: 0, endSec: 60 }, 200)).toBe(true);
    expect(canAddNextClipSegment({ startSec: 0, endSec: 198 }, 200)).toBe(true);
  });
});
