import { describe, expect, it } from 'vitest';
import { parseYoutubeVideoId } from './youtube-video-id';

describe('parseYoutubeVideoId', () => {
  it('accepts bare video ids', () => {
    expect(parseYoutubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses watch URLs', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses youtu.be and shorts', () => {
    expect(parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('rejects empty / invalid', () => {
    expect(parseYoutubeVideoId('')).toBeNull();
    expect(parseYoutubeVideoId('short')).toBeNull();
    expect(parseYoutubeVideoId('not a valid id!!')).toBeNull();
  });
});
