import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEARD_AUDIO_DISK_INDEX_KEY,
  getHeardAudioDiskStats,
  shouldCacheHeardProgress,
  toSameOriginStreamUrl,
} from './heard-audio-cache';

describe('heard-audio-cache disk helpers', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    vi.stubGlobal('window', {
      dispatchEvent: () => true,
      location: { href: 'https://frontend.youtvs.com/' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks track as heard after short progress', () => {
    expect(shouldCacheHeardProgress(8, 200)).toBe(true);
    expect(shouldCacheHeardProgress(3, 200)).toBe(false);
    expect(shouldCacheHeardProgress(30, 100)).toBe(true);
  });

  it('normalizes absolute stream urls to same-origin paths', () => {
    expect(
      toSameOriginStreamUrl('https://api.youtvs.com/v1/youtube/videos/abc/audio/stream?token=t'),
    ).toBe('/v1/youtube/videos/abc/audio/stream?token=t');
    expect(toSameOriginStreamUrl('/v1/youtube/videos/abc/audio/stream?token=t')).toBe(
      '/v1/youtube/videos/abc/audio/stream?token=t',
    );
  });

  it('reports empty disk stats by default', () => {
    expect(store.has(HEARD_AUDIO_DISK_INDEX_KEY)).toBe(false);
    expect(getHeardAudioDiskStats()).toEqual({ count: 0, bytes: 0 });
  });
});
