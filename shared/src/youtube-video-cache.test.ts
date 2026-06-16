import { describe, it, expect } from 'vitest';
import {
  topSearchResultsForVideoPrefetch,
  YOUTUBE_SEARCH_VIDEO_PREFETCH_COUNT,
} from './youtube-video-cache.js';

describe('topSearchResultsForVideoPrefetch', () => {
  it('picks top N by relevanceScore', () => {
    const results = [
      { videoId: 'aaaaaaaaaaa', title: 'Low', relevanceScore: 20 },
      { videoId: 'bbbbbbbbbbb', title: 'High', relevanceScore: 95 },
      { videoId: 'ccccccccccc', title: 'Mid', relevanceScore: 60 },
    ];
    const top = topSearchResultsForVideoPrefetch(results, 2);
    expect(top.map((r) => r.videoId)).toEqual(['bbbbbbbbbbb', 'ccccccccccc']);
  });

  it('defaults to YOUTUBE_SEARCH_VIDEO_PREFETCH_COUNT', () => {
    const results = Array.from({ length: 15 }, (_, i) => ({
      videoId: `a${i.toString().padStart(10, '0')}`,
      title: `Song ${i}`,
      relevanceScore: 100 - i,
    }));
    expect(topSearchResultsForVideoPrefetch(results)).toHaveLength(
      YOUTUBE_SEARCH_VIDEO_PREFETCH_COUNT,
    );
  });
});
