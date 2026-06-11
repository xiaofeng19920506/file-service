import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchVideoCaptions, type CaptionCue } from '../api/youtube-captions';
import {
  readSubtitleLanguageForVideo,
  type SubtitleLanguage,
} from '../lib/subtitle-preference';

type PlaylistDesktopAudioCenterProps = {
  videoId: string;
  title: string;
  currentTime: number;
};

function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export default function PlaylistDesktopAudioCenter({
  videoId,
  title,
  currentTime,
}: PlaylistDesktopAudioCenterProps) {
  const lyricsRef = useRef<HTMLDivElement>(null);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [subtitleLang, setSubtitleLang] = useState<SubtitleLanguage>('en');

  useEffect(() => {
    setSubtitleLang(readSubtitleLanguageForVideo(videoId));
  }, [videoId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchVideoCaptions(videoId, subtitleLang);
        if (!cancelled) setCaptionCues(data.cues);
      } catch {
        if (!cancelled) setCaptionCues([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId, subtitleLang]);

  useEffect(() => {
    const panel = lyricsRef.current;
    if (!panel) return;
    const activeLine = panel.querySelector<HTMLElement>('[data-active="true"]');
    activeLine?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentTime, captionCues]);

  const hasLyrics = captionCues.length > 0;

  const activeIndex = useMemo(() => {
    if (!captionCues.length) return -1;
    return captionCues.findIndex(
      (cue) => currentTime >= cue.start - 0.05 && currentTime < cue.end + 0.05,
    );
  }, [captionCues, currentTime]);

  if (hasLyrics) {
    return (
      <div className="playlist-desktop-audio-center playlist-desktop-audio-center--lyrics">
        <div ref={lyricsRef} className="playlist-desktop-audio-lyrics" aria-live="polite">
          <ul className="playlist-np-lyrics-lines">
            {captionCues.map((cue, index) => {
              const active = index === activeIndex;
              return (
                <li
                  key={`${cue.start}-${index}`}
                  className={active ? 'active' : undefined}
                  data-active={active || undefined}
                >
                  {cue.text}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="playlist-desktop-audio-center playlist-desktop-audio-center--art">
      <div className="playlist-desktop-audio-art-wrap">
        <img
          className="playlist-desktop-audio-art"
          src={youtubeThumb(videoId)}
          alt={title}
          loading="lazy"
        />
      </div>
    </div>
  );
}
