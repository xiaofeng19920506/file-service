import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CaptionCue } from '../api/youtube-captions';
import { findActiveCueIndex } from '../lib/caption-cues';

type PlaylistKaraokeLyricsProps = {
  cues: CaptionCue[];
  currentTime: number;
  loading?: boolean;
  loadingMessage: string;
  emptyMessage: string;
  onOpen: () => void;
  openLabel: string;
};

export default function PlaylistKaraokeLyrics({
  cues,
  currentTime,
  loading = false,
  loadingMessage,
  emptyMessage,
  onOpen,
  openLabel,
}: PlaylistKaraokeLyricsProps) {
  const activeIndex = useMemo(
    () => findActiveCueIndex(cues, currentTime),
    [cues, currentTime],
  );
  // 顶部空行：开唱前当前槽位为空，第一句作为「下一句」
  const displayIndex = activeIndex < 0 ? 0 : activeIndex + 1;
  const prevIndexRef = useRef(displayIndex);
  const [instant, setInstant] = useState(false);

  useLayoutEffect(() => {
    const prev = prevIndexRef.current;
    prevIndexRef.current = displayIndex;
    setInstant(Math.abs(displayIndex - prev) > 1);
  }, [displayIndex]);

  if (loading) {
    return (
      <button
        type="button"
        className="playlist-karaoke playlist-karaoke--status"
        onClick={onOpen}
        aria-label={openLabel}
      >
        <span className="playlist-karaoke-status">{loadingMessage}</span>
      </button>
    );
  }

  if (!cues.length) {
    return (
      <button
        type="button"
        className="playlist-karaoke playlist-karaoke--status"
        onClick={onOpen}
        aria-label={openLabel}
      >
        <span className="playlist-karaoke-status">{emptyMessage}</span>
      </button>
    );
  }

  const lines = [{ key: 'lead', text: '\u00a0' }, ...cues.map((cue, index) => ({
    key: `${cue.start}-${index}`,
    text: cue.text,
  }))];

  return (
    <button
      type="button"
      className="playlist-karaoke"
      onClick={onOpen}
      aria-label={openLabel}
      aria-live="polite"
    >
      <span className="playlist-karaoke-viewport">
        <span
          className={`playlist-karaoke-track${instant ? ' playlist-karaoke-track--instant' : ''}`}
          style={{ transform: `translateY(calc(var(--playlist-karaoke-line) * ${-displayIndex}))` }}
        >
          {lines.map((line, index) => {
            const isCurrent = index === displayIndex && line.key !== 'lead';
            const isNext = index === displayIndex + 1;
            return (
              <span
                key={line.key}
                className={`playlist-karaoke-line${isCurrent ? ' is-current' : ''}${isNext ? ' is-next' : ''}`}
              >
                {line.text}
              </span>
            );
          })}
        </span>
      </span>
    </button>
  );
}
