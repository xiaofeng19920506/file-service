import { describe, expect, it } from 'vitest';
import { findActiveCueIndex } from './caption-cues';

const cues = [
  { start: 0, end: 3.5, text: 'first' },
  { start: 3, end: 6, text: 'second' },
  { start: 6.4, end: 9, text: 'third' },
];

describe('findActiveCueIndex', () => {
  it('picks the later overlapping cue', () => {
    expect(findActiveCueIndex(cues, 3.2)).toBe(1);
    expect(cues[findActiveCueIndex(cues, 3.2)]?.text).toBe('second');
  });

  it('keeps the previous line in a short gap', () => {
    expect(findActiveCueIndex(cues, 6.2)).toBe(1);
  });

  it('returns the matching cue after the gap', () => {
    expect(findActiveCueIndex(cues, 6.5)).toBe(2);
  });

  it('returns -1 before the first cue', () => {
    expect(findActiveCueIndex(cues, -1)).toBe(-1);
  });
});
