import { describe, expect, it } from 'vitest';
import { findActiveCueIndex, mergeShortLyricCues } from './caption-cues';

const cues = [
  { start: 0, end: 3.5, text: 'first' },
  { start: 3, end: 6, text: 'second' },
  { start: 6.4, end: 9, text: 'third' },
];

describe('findActiveCueIndex', () => {
  it('holds the previous line a bit after the next cue starts', () => {
    expect(findActiveCueIndex(cues, 3.2)).toBe(0);
    expect(cues[findActiveCueIndex(cues, 3.2)]?.text).toBe('first');
    expect(findActiveCueIndex(cues, 3.7)).toBe(1);
  });

  it('keeps the previous line in a short gap', () => {
    expect(findActiveCueIndex(cues, 6.2)).toBe(1);
  });

  it('returns the matching cue after the lag', () => {
    expect(findActiveCueIndex(cues, 7.1)).toBe(2);
  });

  it('returns -1 before the first cue', () => {
    expect(findActiveCueIndex(cues, -1)).toBe(-1);
  });
});

describe('mergeShortLyricCues', () => {
  it('joins word-level timestamps into one line', () => {
    const merged = mergeShortLyricCues([
      { start: 12, end: 12.4, text: '我' },
      { start: 12.4, end: 12.9, text: '不愿' },
      { start: 12.9, end: 13.5, text: '让你' },
      { start: 13.5, end: 15.2, text: '一个人' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toBe('我不愿让你一个人');
    expect(merged[0]?.end ?? 0).toBeGreaterThanOrEqual(15.2);
  });
});
