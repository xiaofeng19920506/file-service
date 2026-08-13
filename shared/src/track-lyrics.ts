import { fetchCatalogLyrics } from './lyrics-catalog.js';
import {
  fetchYoutubeVideoCaptions,
  type SubtitleLanguage,
  type YoutubeCaptionsResult,
} from './youtube-captions.js';

export async function fetchAllTrackLyrics(
  videoId: string,
  opts: { subtitleLang?: SubtitleLanguage; title?: string } = {},
): Promise<YoutubeCaptionsResult | null> {
  const fromYoutube = await fetchYoutubeVideoCaptions(videoId, opts);
  if (fromYoutube?.cues.length) return fromYoutube;

  const title = opts.title?.trim();
  if (!title) return fromYoutube;

  const catalog = await fetchCatalogLyrics(title);
  if (!catalog?.cues.length) return null;

  const wantEnglish = opts.subtitleLang === 'en';
  if (wantEnglish && catalog.language !== 'en') return null;

  return {
    videoId,
    language: catalog.language,
    sourceLanguage: catalog.source,
    translated: false,
    cues: catalog.cues,
  };
}
