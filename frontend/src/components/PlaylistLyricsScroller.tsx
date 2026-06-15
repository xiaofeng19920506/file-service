import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { CaptionCue } from '../api/youtube-captions';
import { findActiveCueIndex } from '../lib/caption-cues';

const TAP_MOVE_THRESHOLD_PX = 10;

type PlaylistLyricsScrollerProps = {
  cues: CaptionCue[];
  currentTime: number;
  emptyMessage: string;
  loading?: boolean;
  loadingMessage?: string;
  className?: string;
  panelRef?: RefObject<HTMLDivElement | null>;
  /** 轻点歌词区域（非滚动）时回调，用于手机端返回 CD */
  onTap?: () => void;
};

function useTapWithoutScroll(onTap?: () => void) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (!onTap) return;
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
      movedRef.current = false;
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!onTap || !pointerStartRef.current) return;
      const dx = Math.abs(event.clientX - pointerStartRef.current.x);
      const dy = Math.abs(event.clientY - pointerStartRef.current.y);
      if (dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) {
        movedRef.current = true;
      }
    },
    onPointerUp: () => {
      if (!onTap) return;
      if (!movedRef.current) onTap();
      pointerStartRef.current = null;
      movedRef.current = false;
    },
    onPointerCancel: () => {
      pointerStartRef.current = null;
      movedRef.current = false;
    },
  };
}

export default function PlaylistLyricsScroller({
  cues,
  currentTime,
  emptyMessage,
  loading = false,
  loadingMessage,
  className = '',
  panelRef: panelRefProp,
  onTap,
}: PlaylistLyricsScrollerProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const panelRef = panelRefProp ?? internalRef;
  const tapHandlers = useTapWithoutScroll(onTap);
  const tapClass = onTap ? ' playlist-lyrics-scroller--tappable' : '';

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
      <div
        className={`playlist-lyrics-scroller playlist-lyrics-scroller--loading${tapClass}${className ? ` ${className}` : ''}`}
        {...tapHandlers}
      >
        <p className="playlist-lyrics-scroller-status">{loadingMessage}</p>
      </div>
    );
  }

  if (!cues.length) {
    return (
      <div
        className={`playlist-lyrics-scroller playlist-lyrics-scroller--empty${tapClass}${className ? ` ${className}` : ''}`}
        {...tapHandlers}
      >
        <p className="playlist-lyrics-scroller-status">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`playlist-lyrics-scroller${tapClass}${className ? ` ${className}` : ''}`}
      aria-live="polite"
      {...tapHandlers}
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
