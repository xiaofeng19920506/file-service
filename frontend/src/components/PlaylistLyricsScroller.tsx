import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { CaptionCue } from '../api/youtube-captions';
import { findActiveCueIndex } from '../lib/caption-cues';

const TAP_MOVE_THRESHOLD_PX = 10;
const USER_SCROLL_PAUSE_MS = 3500;

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

function scrollLineToCenter(panel: HTMLElement, line: HTMLElement) {
  const panelRect = panel.getBoundingClientRect();
  const lineRect = line.getBoundingClientRect();
  const delta =
    lineRect.top + lineRect.height / 2 - (panelRect.top + panelRect.height / 2);
  if (Math.abs(delta) < 4) return;
  const maxScroll = Math.max(0, panel.scrollHeight - panel.clientHeight);
  const nextTop = Math.min(maxScroll, Math.max(0, panel.scrollTop + delta));
  panel.scrollTo({ top: nextTop, behavior: 'smooth' });
}

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
  const suppressAutoScrollUntilRef = useRef(0);
  const scrollActiveRef = useRef<() => void>(() => {});
  const resumeTimerRef = useRef<number>(0);

  const activeIndex = useMemo(
    () => findActiveCueIndex(cues, currentTime),
    [cues, currentTime],
  );

  scrollActiveRef.current = () => {
    const panel = panelRef.current;
    if (!panel || activeIndex < 0) return;
    if (Date.now() < suppressAutoScrollUntilRef.current) return;
    const activeLine = panel.querySelector<HTMLElement>('[data-active="true"]');
    if (!activeLine) return;
    scrollLineToCenter(panel, activeLine);
  };

  useEffect(() => {
    if (loading || !cues.length) return;
    scrollActiveRef.current();
  }, [activeIndex, cues.length, panelRef, loading]);

  useEffect(() => {
    suppressAutoScrollUntilRef.current = 0;
  }, [cues.length]);

  useEffect(() => {
    if (loading || !cues.length) return;
    const panel = panelRef.current;
    if (!panel) return;

    const pauseAutoScroll = () => {
      suppressAutoScrollUntilRef.current = Date.now() + USER_SCROLL_PAUSE_MS;
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = window.setTimeout(() => {
        scrollActiveRef.current();
      }, USER_SCROLL_PAUSE_MS);
    };

    panel.addEventListener('wheel', pauseAutoScroll, { passive: true });
    panel.addEventListener('touchmove', pauseAutoScroll, { passive: true });

    return () => {
      panel.removeEventListener('wheel', pauseAutoScroll);
      panel.removeEventListener('touchmove', pauseAutoScroll);
      window.clearTimeout(resumeTimerRef.current);
    };
  }, [panelRef, cues.length, loading]);

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
      <div className="playlist-np-lyrics-lines" role="list">
        {cues.map((cue, index) => {
          const active = index === activeIndex;
          return (
            <div
              key={`${cue.start}-${index}`}
              role="listitem"
              className={`playlist-np-lyrics-line${active ? ' active' : ''}`}
              data-active={active || undefined}
            >
              {cue.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
