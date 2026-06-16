import { describe, expect, it } from 'vitest';
import {
  buildRecommendationProfile,
  rankRecommendationCandidates,
  scoreRecommendationCandidate,
  tokenizeRecommendationText,
} from './youtube-recommendations.js';

describe('tokenizeRecommendationText', () => {
  it('splits mixed Chinese and English queries', () => {
    const tokens = tokenizeRecommendationText('敬拜赞美 诗歌 Hillsong');
    expect(tokens).toContain('敬拜赞美');
    expect(tokens).toContain('hillsong');
  });
});

describe('recommendation scoring', () => {
  it('prefers videos matching recent search and play interests', () => {
    const profile = buildRecommendationProfile({
      plays: [
        {
          videoId: 'played1',
          title: '敬拜团现场',
          channelTitle: '教会敬拜',
          weight: 5,
        },
      ],
      searches: [{ query: '赞美之泉', weight: 4 }],
      libraryTitles: [],
    });

    const worshipMatch = scoreRecommendationCandidate(
      {
        videoId: 'a',
        title: '赞美之泉 敬拜现场',
        channelTitle: '教会敬拜',
        playCount: 3,
        inLibrary: false,
      },
      profile,
    );
    const unrelated = scoreRecommendationCandidate(
      {
        videoId: 'b',
        title: '烹饪教学',
        channelTitle: '美食频道',
        playCount: 50,
        inLibrary: false,
      },
      profile,
    );

    expect(worshipMatch).toBeGreaterThan(unrelated);
  });

  it('excludes very recent plays and falls back to popularity', () => {
    const profile = buildRecommendationProfile({
      plays: [
        {
          videoId: 'recent',
          title: '刚播过的歌',
          channelTitle: null,
          weight: 5,
        },
      ],
      searches: [],
      libraryTitles: [],
    });

    const ranked = rankRecommendationCandidates(
      [
        {
          videoId: 'recent',
          title: '刚播过的歌',
          channelTitle: null,
          playCount: 20,
          inLibrary: false,
        },
        {
          videoId: 'next',
          title: '社区热门',
          channelTitle: null,
          playCount: 10,
          inLibrary: false,
        },
      ],
      profile,
      2,
    );

    expect(ranked.map((row) => row.videoId)).toEqual(['next']);
  });
});
