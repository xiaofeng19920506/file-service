import { fetchVideoCaptions, type CaptionCue } from '../api/youtube-captions';
import type { SubtitleLanguage } from './subtitle-preference';

type LyricsCacheEntry = {
  cues: CaptionCue[];
  language: SubtitleLanguage;
  cachedAt: number;
  empty: boolean;
};

const lyricsCache = new Map<string, LyricsCacheEntry>();
type LyricsLoadResult = {
  cues: CaptionCue[];
  language: SubtitleLanguage;
  generating?: boolean;
};

const inflight = new Map<string, Promise<LyricsLoadResult>>();
const EMPTY_CACHE_TTL_MS = 120_000;

function cacheKey(videoId: string, lang: SubtitleLanguage): string {
  return `v2:${videoId}:${lang}`;
}

export function readDefaultSubtitleLanguage(locale: string): SubtitleLanguage {
  return locale.startsWith('zh') ? 'zh' : 'en';
}

export function readStoredSubtitleLanguage(
  videoId: string,
  defaultLang: SubtitleLanguage,
): SubtitleLanguage {
  try {
    const raw = localStorage.getItem(`subtitle-lang:${videoId}`);
    return raw === 'zh' || raw === 'en' ? raw : defaultLang;
  } catch {
    return defaultLang;
  }
}

function readCache(key: string): LyricsCacheEntry | undefined {
  const entry = lyricsCache.get(key);
  if (!entry) return undefined;
  if (entry.empty && Date.now() - entry.cachedAt > EMPTY_CACHE_TTL_MS) {
    lyricsCache.delete(key);
    return undefined;
  }
  return entry;
}

function writeCache(
  videoId: string,
  preferredLang: SubtitleLanguage,
  result: { cues: CaptionCue[]; language: SubtitleLanguage },
): void {
  const empty = result.cues.length === 0;
  const entry: LyricsCacheEntry = {
    cues: result.cues,
    language: result.language,
    cachedAt: Date.now(),
    empty,
  };
  const preferredKey = cacheKey(videoId, preferredLang);
  const existing = lyricsCache.get(preferredKey);
  if (existing && !existing.empty && empty) return;

  lyricsCache.set(preferredKey, entry);
  if (result.language !== preferredLang && !empty) {
    lyricsCache.set(cacheKey(videoId, result.language), entry);
  }
}

async function fetchPreferredThenFallback(
  videoId: string,
  preferredLang: SubtitleLanguage,
  title?: string,
): Promise<LyricsLoadResult> {
  const fallbackLang: SubtitleLanguage = preferredLang === 'zh' ? 'en' : 'zh';

  try {
    const data = await fetchVideoCaptions(videoId, preferredLang, title);
    if (data.cues.length) {
      return { cues: data.cues, language: preferredLang };
    }
    try {
      const alt = await fetchVideoCaptions(videoId, fallbackLang, title);
      if (alt.cues.length) {
        return { cues: alt.cues, language: fallbackLang };
      }
      return {
        cues: [],
        language: preferredLang,
        generating: Boolean(data.generating || alt.generating),
      };
    } catch {
      return { cues: [], language: preferredLang, generating: Boolean(data.generating) };
    }
  } catch (preferredErr) {
    try {
      const alt = await fetchVideoCaptions(videoId, fallbackLang, title);
      if (alt.cues.length) {
        return { cues: alt.cues, language: fallbackLang };
      }
      return { cues: [], language: preferredLang, generating: Boolean(alt.generating) };
    } catch {
      /* 两种语言都失败时抛出原始错误，让 UI 显示加载失败而不是「暂无歌词」 */
    }
    throw preferredErr;
  }
}

export async function loadTrackLyrics(
  videoId: string,
  preferredLang: SubtitleLanguage,
  title?: string,
): Promise<LyricsLoadResult> {
  const key = cacheKey(videoId, preferredLang);
  const cached = readCache(key);
  if (cached) {
    return { cues: cached.cues, language: cached.language };
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = fetchPreferredThenFallback(videoId, preferredLang, title)
    .then((result) => {
      if (!(result.generating && result.cues.length === 0)) {
        writeCache(videoId, preferredLang, result);
      }
      return result;
    })
    .finally(() => {
      if (inflight.get(key) === request) inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

export function prefetchTrackLyrics(
  videoId: string,
  preferredLang: SubtitleLanguage,
  title?: string,
): void {
  const key = cacheKey(videoId, preferredLang);
  if (readCache(key) || inflight.has(key)) return;
  void loadTrackLyrics(videoId, preferredLang, title).catch(() => undefined);
}

export function clearTrackLyricsCache(videoId?: string): void {
  if (!videoId) {
    lyricsCache.clear();
    inflight.clear();
    return;
  }
  const prefix = `v2:${videoId}:`;
  for (const key of lyricsCache.keys()) {
    if (key.startsWith(prefix)) lyricsCache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}
