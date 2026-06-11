import { describe, it, expect } from 'vitest';
import { normalizeYoutubeVideoId, normalizeYoutubeVideoIds } from './youtube.js';

describe('normalizeYoutubeVideoId', () => {
  it('accepts raw 11-char ids', () => {
    expect(normalizeYoutubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts from watch urls', () => {
    expect(normalizeYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts from shorts urls', () => {
    expect(normalizeYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('normalizeYoutubeVideoIds', () => {
  it('deduplicates valid ids', () => {
    const result = normalizeYoutubeVideoIds(['dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'bad']);
    expect(result.valid).toEqual(['dQw4w9WgXcQ']);
    expect(result.invalid).toEqual(['bad']);
  });
});
