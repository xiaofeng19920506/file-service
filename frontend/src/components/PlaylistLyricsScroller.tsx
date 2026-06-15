import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { CaptionCue } from '../api/youtube-captions';
import { findActiveCueIndex } from '../lib/caption-cues';

type PlaylistLyricsScrollerProps = {
  cues: CaptionCue[];
  currentTime: number;
  emptyMessage: string;
  loading?: boolean;
  loadingMessage?: string;
  className?: string;
  panelRef?: RefObject<HTMLDivElement | null>;
};

export default function PlaylistLyricsScroller({
  cues,
  currentTime,
  emptyMessage,
  loading = false,
  loadingMessage,
  className = '',
  panelRef: panelRefProp,
}: PlaylistLyricsScrollerProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const panelRef = panelRefProp ?? internalRef;

  const activeIndex = useMemo(
    () => findActiveCueIndex(cues, currentTime),
    [cues, currentTime],
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || activeIndex < 0) return;
    const activeLine = panel.querySelector<HTMLElement>('[data-active="true"]');
    if (!activeLine) return;

    const panelHeight = panel.clientHeight;
    const lineTop = activeLine.offsetTop;
    const lineHeight = activeLine.offsetHeight;
    const targetScroll = lineTop - panelHeight / 2 + lineHeight / 2;
    panel.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [activeIndex, cues.length, panelRef]);

  if (loading) {
    return (
      <div className={`playlist-lyrics-scroller playlist-lyrics-scroller--loading${className ? ` ${className}` : ''}`}>
        <p className="playlist-lyrics-scroller-status">{loadingMessage}</p>
      </div>
    );
  }

  if (!cues.length) {
    return (
      <div className={`playlist-lyrics-scroller playlist-lyrics-scroller--empty${className ? ` ${className}` : ''}`}>
        <p className="playlist-lyrics-scroller-status">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`playlist-lyrics-scroller${className ? ` ${className}` : ''}`}
      aria-live="polite"
    >
      <ul className="playlist-np-lyrics-lines">
        {cues.map((cue, index) => {
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
  );
}
