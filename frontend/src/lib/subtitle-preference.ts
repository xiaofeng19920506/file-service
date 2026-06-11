export type SubtitleLanguage = 'zh' | 'en';

const STORAGE_PREFIX = 'subtitle-lang:';
export const DEFAULT_SUBTITLE_LANGUAGE: SubtitleLanguage = 'en';

export function readSubtitleLanguageForVideo(videoId: string): SubtitleLanguage {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${videoId}`);
    return raw === 'zh' ? 'zh' : DEFAULT_SUBTITLE_LANGUAGE;
  } catch {
    return DEFAULT_SUBTITLE_LANGUAGE;
  }
}

export function writeSubtitleLanguageForVideo(
  videoId: string,
  lang: SubtitleLanguage,
): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${videoId}`, lang);
  } catch {
    // ignore
  }
}
