import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CaptionCue } from '../api/youtube-captions';
import { findActiveCaption } from '../api/youtube-captions';
import {
  loadTrackLyrics,
  readDefaultSubtitleLanguage,
  readStoredSubtitleLanguage,
} from '../lib/playlist-lyrics';
import {
  writeSubtitleLanguageForVideo,
  type SubtitleLanguage,
} from '../lib/subtitle-preference';

type UsePlaylistTrackLyricsOptions = {
  videoId?: string;
  locale: string;
};

export function usePlaylistTrackLyrics({ videoId, locale }: UsePlaylistTrackLyricsOptions) {
  const defaultSubtitleLang = readDefaultSubtitleLanguage(locale);
  const [subtitleLang, setSubtitleLang] = useState<SubtitleLanguage>(defaultSubtitleLang);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) {
      setCaptionCues([]);
      setLyricsLoading(false);
      setLoadedVideoId(null);
      return;
    }

    setSubtitleLang(readStoredSubtitleLanguage(videoId, defaultSubtitleLang));
    setCaptionCues([]);
    setLyricsLoading(true);
    setLoadedVideoId(null);

    let cancelled = false;
    const requestId = videoId;

    void (async () => {
      try {
        const lang = readStoredSubtitleLanguage(requestId, defaultSubtitleLang);
        const { cues, language } = await loadTrackLyrics(requestId, lang);
        if (cancelled) return;
        setSubtitleLang(language);
        setCaptionCues(cues);
        setLoadedVideoId(requestId);
      } catch {
        if (!cancelled) {
          setCaptionCues([]);
          setLoadedVideoId(requestId);
        }
      } finally {
        if (!cancelled) {
          setLyricsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoId, defaultSubtitleLang]);

  const changeSubtitleLang = useCallback(
    (lang: SubtitleLanguage) => {
      if (!videoId) return;
      setSubtitleLang(lang);
      writeSubtitleLanguageForVideo(videoId, lang);
      setCaptionCues([]);
      setLyricsLoading(true);
      setLoadedVideoId(null);

      const requestId = videoId;
      void (async () => {
        try {
          const { cues, language } = await loadTrackLyrics(requestId, lang);
          if (videoId !== requestId) return;
          setSubtitleLang(language);
          setCaptionCues(cues);
          setLoadedVideoId(requestId);
        } catch {
          if (videoId === requestId) {
            setCaptionCues([]);
            setLoadedVideoId(requestId);
          }
        } finally {
          if (videoId === requestId) {
            setLyricsLoading(false);
          }
        }
      })();
    },
    [videoId],
  );

  const lyricsReadyForCurrentTrack = loadedVideoId != null && loadedVideoId === videoId;

  return {
    captionCues: lyricsReadyForCurrentTrack ? captionCues : [],
    lyricsLoading: Boolean(videoId) && (!lyricsReadyForCurrentTrack || lyricsLoading),
    subtitleLang,
    changeSubtitleLang,
    lyricsReadyForCurrentTrack,
  };
}

export function useActiveLyricLine(cues: CaptionCue[], currentTime: number): string | null {
  return useMemo(() => findActiveCaption(cues, currentTime), [cues, currentTime]);
}
