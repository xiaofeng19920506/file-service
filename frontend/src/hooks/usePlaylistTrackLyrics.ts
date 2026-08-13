import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const [lyricsError, setLyricsError] = useState(false);
  const videoIdRef = useRef(videoId);
  const requestSeqRef = useRef(0);
  videoIdRef.current = videoId;

  const applyIfCurrent = useCallback((seq: number, requestId: string, update: () => void) => {
    if (seq !== requestSeqRef.current) return;
    if (videoIdRef.current !== requestId) return;
    update();
  }, []);

  useEffect(() => {
    if (!videoId) {
      requestSeqRef.current += 1;
      setCaptionCues([]);
      setLoadedVideoId(null);
      setLyricsError(false);
      return;
    }

    const requestId = videoId;
    const seq = ++requestSeqRef.current;
    setSubtitleLang(readStoredSubtitleLanguage(requestId, defaultSubtitleLang));
    setCaptionCues([]);
    setLoadedVideoId(null);
    setLyricsError(false);

    void (async () => {
      try {
        const lang = readStoredSubtitleLanguage(requestId, defaultSubtitleLang);
        const { cues, language } = await loadTrackLyrics(requestId, lang);
        applyIfCurrent(seq, requestId, () => {
          setSubtitleLang(language);
          setCaptionCues(cues);
          setLoadedVideoId(requestId);
          setLyricsError(false);
        });
      } catch {
        applyIfCurrent(seq, requestId, () => {
          setCaptionCues([]);
          setLoadedVideoId(requestId);
          setLyricsError(true);
        });
      }
    })();
  }, [videoId, defaultSubtitleLang, applyIfCurrent]);

  const changeSubtitleLang = useCallback(
    (lang: SubtitleLanguage) => {
      const requestId = videoIdRef.current;
      if (!requestId) return;
      const seq = ++requestSeqRef.current;
      setSubtitleLang(lang);
      writeSubtitleLanguageForVideo(requestId, lang);
      setCaptionCues([]);
      setLoadedVideoId(null);
      setLyricsError(false);

      void (async () => {
        try {
          const { cues, language } = await loadTrackLyrics(requestId, lang);
          applyIfCurrent(seq, requestId, () => {
            setSubtitleLang(language);
            setCaptionCues(cues);
            setLoadedVideoId(requestId);
            setLyricsError(false);
          });
        } catch {
          applyIfCurrent(seq, requestId, () => {
            setCaptionCues([]);
            setLoadedVideoId(requestId);
            setLyricsError(true);
          });
        }
      })();
    },
    [applyIfCurrent],
  );

  const lyricsReadyForCurrentTrack = loadedVideoId != null && loadedVideoId === videoId;

  return {
    captionCues: lyricsReadyForCurrentTrack ? captionCues : [],
    lyricsLoading: Boolean(videoId) && !lyricsReadyForCurrentTrack,
    lyricsError: lyricsReadyForCurrentTrack && lyricsError,
    subtitleLang,
    changeSubtitleLang,
    lyricsReadyForCurrentTrack,
  };
}

export function useActiveLyricLine(cues: CaptionCue[], currentTime: number): string | null {
  return useMemo(() => findActiveCaption(cues, currentTime), [cues, currentTime]);
}
