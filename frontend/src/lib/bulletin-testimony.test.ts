import { describe, expect, it } from 'vitest';
import {
  buildTestimonyShareReplacements,
  normalizeTestimonyShareDate,
} from './bulletin-pptx-patches';

describe('normalizeTestimonyShareDate', () => {
  it('keeps bare dates and extracts from legacy title', () => {
    expect(normalizeTestimonyShareDate('8/30')).toBe('8/30');
    expect(normalizeTestimonyShareDate('下主日8/30見證分享')).toBe('8/30');
    expect(normalizeTestimonyShareDate('')).toBe('');
  });
});

describe('buildTestimonyShareReplacements', () => {
  it('writes title and large body date', () => {
    expect(buildTestimonyShareReplacements({ testimonyShareDate: '9/6' })).toEqual([
      { textIndex: 0, text: '下主日9/6見證分享' },
      { textIndex: 2, text: '9/6' },
    ]);
  });
});
