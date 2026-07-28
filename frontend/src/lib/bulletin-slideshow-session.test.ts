import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSlideShowSession,
  readSlideShowSession,
  removeSlideShowSession,
} from './bulletin-slideshow-session';

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
  };
}

describe('bulletin-slideshow-session', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores session in localStorage so noopener projector windows can read it', () => {
    const sessionId = createSlideShowSession({
      patch: { serviceDate: '2026-08-02' },
      initialSlide: 3,
      totalSlides: 30,
    });

    expect(localStorage.getItem(`bulletin-slideshow:${sessionId}`)).toBeTruthy();
    expect(sessionStorage.getItem(`bulletin-slideshow:${sessionId}`)).toBeNull();

    const session = readSlideShowSession(sessionId);
    expect(session).toMatchObject({
      initialSlide: 3,
      totalSlides: 30,
      patch: { serviceDate: '2026-08-02' },
    });

    removeSlideShowSession(sessionId);
    expect(readSlideShowSession(sessionId)).toBeNull();
  });

  it('expires stale sessions', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const sessionId = createSlideShowSession({
      patch: {},
      initialSlide: 1,
      totalSlides: 10,
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 6 * 60 * 60 * 1000 + 1);
    expect(readSlideShowSession(sessionId)).toBeNull();
  });
});
