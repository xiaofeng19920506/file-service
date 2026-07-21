import { describe, expect, it } from 'vitest';
import { scoreYoutubeTitleMatch } from './youtube-search.js';

describe('scoreYoutubeTitleMatch', () => {
  it('scores exact and partial Chinese matches', () => {
    expect(scoreYoutubeTitleMatch('奇异恩典', '奇异恩典')).toBe(100);
    expect(scoreYoutubeTitleMatch('奇异恩典', 'Amazing Grace 奇异恩典 - 赞美之泉')).toBeGreaterThanOrEqual(78);
  });

  it('returns 0 when title language differs (must not be used to drop YouTube hits)', () => {
    expect(scoreYoutubeTitleMatch('主爱奇妙', 'The Love of God Is Wonderful (Official Lyric Video)')).toBe(0);
  });
});
