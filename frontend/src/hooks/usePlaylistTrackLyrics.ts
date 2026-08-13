import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaptionCue } from '../api/youtube-captions';
import { findActiveCaption } from '../api/youtube-captions';
import { mergeShortLyricCues } from '../lib/caption-cues';
import {
  clearTrackLyricsCache,
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
  title?: string;
  locale: string;
};

export function usePlaylistTrackLyrics({ videoId, title, locale }: UsePlaylistTrackLyricsOptions) {
  const defaultSubtitleLang = readDefaultSubtitleLanguage(locale);
  const [subtitleLang, setSubtitleLang] = useState<SubtitleLanguage>(defaultSubtitleLang);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const [lyricsError, setLyricsError] = useState(false);
  const [lyricsGenerating, setLyricsGenerating] = useState(false);
  const videoIdRef = useRef(videoId);
  const titleRef = useRef(title);
  const requestSeqRef = useRef(0);
  videoIdRef.current = videoId;
  titleRef.current = title;

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
    setLyricsGenerating(false);

    void (async () => {
      try {
        const lang = readStoredSubtitleLanguage(requestId, defaultSubtitleLang);
        const { cues, language, generating } = await loadTrackLyrics(requestId, lang, title);
        applyIfCurrent(seq, requestId, () => {
          setSubtitleLang(language);
          setCaptionCues(cues);
          setLyricsGenerating(Boolean(generating && cues.length === 0));
          if (!generating || cues.length > 0) setLoadedVideoId(requestId);
          setLyricsError(false);
        });
      } catch {
        applyIfCurrent(seq, requestId, () => {
          setCaptionCues([]);
          setLoadedVideoId(requestId);
          setLyricsGenerating(false);
          setLyricsError(true);
        });
      }
    })();
  }, [videoId, title, defaultSubtitleLang, applyIfCurrent]);

  useEffect(() => {
    if (!videoId || !lyricsGenerating) return;
    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > 40) {
        window.clearInterval(timer);
        setLyricsGenerating(false);
        setLoadedVideoId(videoId);
        return;
      }
      const requestId = videoId;
      const seq = requestSeqRef.current;
      clearTrackLyricsCache(requestId);
      void loadTrackLyrics(
        requestId,
        readStoredSubtitleLanguage(requestId, defaultSubtitleLang),
        titleRef.current,
      ).then(({ cues, language, generating }) => {
        if (cancelled) return;
        applyIfCurrent(seq, requestId, () => {
          if (cues.length > 0) {
            setSubtitleLang(language);
            setCaptionCues(cues);
            setLyricsGenerating(false);
            setLoadedVideoId(requestId);
            return;
          }
          if (!generating) {
            setLyricsGenerating(false);
            setLoadedVideoId(requestId);
          }
        });
      });
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [videoId, lyricsGenerating, defaultSubtitleLang, applyIfCurrent]);

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
      setLyricsGenerating(false);

      void (async () => {
        try {
          const { cues, language, generating } = await loadTrackLyrics(requestId, lang, title);
          applyIfCurrent(seq, requestId, () => {
            setSubtitleLang(language);
            setCaptionCues(cues);
            setLyricsGenerating(Boolean(generating && cues.length === 0));
            if (!generating || cues.length > 0) setLoadedVideoId(requestId);
            setLyricsError(false);
          });
        } catch {
          applyIfCurrent(seq, requestId, () => {
            setCaptionCues([]);
            setLoadedVideoId(requestId);
            setLyricsGenerating(false);
            setLyricsError(true);
          });
        }
      })();
    },
    [applyIfCurrent, title],
  );

  const lyricsReadyForCurrentTrack = loadedVideoId != null && loadedVideoId === videoId;
  const displayCues = useMemo(
    () => (lyricsReadyForCurrentTrack ? mergeShortLyricCues(captionCues) : []),
    [lyricsReadyForCurrentTrack, captionCues],
  );

  return {
    captionCues: displayCues,
    lyricsLoading: Boolean(videoId) && (!lyricsReadyForCurrentTrack || lyricsGenerating),
    lyricsGenerating,
    lyricsError: lyricsReadyForCurrentTrack && lyricsError,
    subtitleLang,
    changeSubtitleLang,
    lyricsReadyForCurrentTrack,
  };
}

export function useActiveLyricLine(cues: CaptionCue[], currentTime: number): string | null {
  return useMemo(() => findActiveCaption(cues, currentTime), [cues, currentTime]);
}
