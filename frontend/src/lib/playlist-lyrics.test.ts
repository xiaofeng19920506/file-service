import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchVideoCaptions } from '../api/youtube-captions';
import {
  clearTrackLyricsCache,
  loadTrackLyrics,
  prefetchTrackLyrics,
} from './playlist-lyrics';

vi.mock('../api/youtube-captions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/youtube-captions')>();
  return {
    ...actual,
    fetchVideoCaptions: vi.fn(),
  };
});

const fetchMock = vi.mocked(fetchVideoCaptions);

function cues(text: string) {
  return [{ start: 0, end: 2, text }];
}

function captions(videoId: string, language: 'zh' | 'en', text?: string) {
  return {
    videoId,
    language,
    sourceLanguage: null,
    translated: false,
    cues: text ? cues(text) : [],
  };
}

describe('loadTrackLyrics', () => {
  beforeEach(() => {
    clearTrackLyricsCache();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dedupes in-flight prefetch and hook loads', async () => {
    fetchMock.mockResolvedValue(captions('bbbbbbbbbbb', 'zh', 'shared'));

    prefetchTrackLyrics('bbbbbbbbbbb', 'zh');
    const result = await loadTrackLyrics('bbbbbbbbbbb', 'zh');
    expect(result.cues).toEqual(cues('shared'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the other language when preferred is empty', async () => {
    fetchMock.mockImplementation(async (_id, lang) =>
      captions('ccccccccccc', lang, lang === 'en' ? 'english' : undefined),
    );

    const result = await loadTrackLyrics('ccccccccccc', 'zh');
    expect(result.language).toBe('en');
    expect(result.cues).toEqual(cues('english'));
  });

  it('falls back when preferred language throws', async () => {
    fetchMock.mockImplementation(async (_id, lang) => {
      if (lang === 'zh') throw new Error('captions_fetch_failed');
      return captions('ddddddddddd', 'en', 'english');
    });

    const result = await loadTrackLyrics('ddddddddddd', 'zh');
    expect(result.language).toBe('en');
    expect(result.cues).toEqual(cues('english'));
  });

  it('retries empty lyrics after the short TTL', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(captions('aaaaaaaaaaa', 'zh'))
      .mockResolvedValueOnce(captions('aaaaaaaaaaa', 'en'))
      .mockResolvedValueOnce(captions('aaaaaaaaaaa', 'zh', 'later'));

    const empty = await loadTrackLyrics('aaaaaaaaaaa', 'zh');
    expect(empty.cues).toEqual([]);

    const cached = await loadTrackLyrics('aaaaaaaaaaa', 'zh');
    expect(cached.cues).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(121_000);
    const retried = await loadTrackLyrics('aaaaaaaaaaa', 'zh');
    expect(retried.cues).toEqual(cues('later'));
  });
});
