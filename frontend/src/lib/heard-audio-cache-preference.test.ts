import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEARD_AUDIO_CACHE_PREF_KEY,
  readHeardAudioCacheEnabled,
  writeHeardAudioCacheEnabled,
} from './heard-audio-cache-preference';

describe('heard-audio-cache-preference', () => {
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
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to enabled', () => {
    expect(readHeardAudioCacheEnabled()).toBe(true);
  });

  it('persists off and on', () => {
    writeHeardAudioCacheEnabled(false);
    expect(store.get(HEARD_AUDIO_CACHE_PREF_KEY)).toBe('0');
    expect(readHeardAudioCacheEnabled()).toBe(false);
    writeHeardAudioCacheEnabled(true);
    expect(readHeardAudioCacheEnabled()).toBe(true);
  });
});
