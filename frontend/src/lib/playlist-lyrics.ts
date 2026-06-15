import { fetchVideoCaptions, type CaptionCue } from '../api/youtube-captions';
import type { SubtitleLanguage } from './subtitle-preference';

const lyricsCache = new Map<string, CaptionCue[]>();

function cacheKey(videoId: string, lang: SubtitleLanguage): string {
  return `${videoId}:${lang}`;
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

export async function loadTrackLyrics(
  videoId: string,
  preferredLang: SubtitleLanguage,
): Promise<{ cues: CaptionCue[]; language: SubtitleLanguage }> {
  const cached = lyricsCache.get(cacheKey(videoId, preferredLang));
  if (cached) {
    return { cues: cached, language: preferredLang };
  }

  let data = await fetchVideoCaptions(videoId, preferredLang);
  let language = preferredLang;
  if (!data.cues.length) {
    const fallback: SubtitleLanguage = preferredLang === 'zh' ? 'en' : 'zh';
    const alt = await fetchVideoCaptions(videoId, fallback);
    if (alt.cues.length) {
      data = alt;
      language = fallback;
    }
  }

  lyricsCache.set(cacheKey(videoId, language), data.cues);
  return { cues: data.cues, language };
}

export function prefetchTrackLyrics(videoId: string, preferredLang: SubtitleLanguage): void {
  const key = cacheKey(videoId, preferredLang);
  if (lyricsCache.has(key)) return;
  void loadTrackLyrics(videoId, preferredLang).catch(() => undefined);
}

export function clearTrackLyricsCache(videoId?: string): void {
  if (!videoId) {
    lyricsCache.clear();
    return;
  }
  for (const key of lyricsCache.keys()) {
    if (key.startsWith(`${videoId}:`)) lyricsCache.delete(key);
  }
}
