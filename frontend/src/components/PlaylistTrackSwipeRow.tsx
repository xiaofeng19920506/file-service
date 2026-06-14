import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

const ACTION_WIDTH_PX = 76;
const DRAG_CLICK_THRESHOLD_PX = 6;
const SUPPRESS_CLICK_MS = 700;

type PlaylistTrackSwipeRowProps = {
  title: string;
  thumbUrl: string;
  isActive: boolean;
  isPlaying: boolean;
  opened: boolean;
  onOpenedChange: (open: boolean) => void;
  onPlay: () => void;
  onDeleteRequest: () => void;
  deleteBusy?: boolean;
};

export default function PlaylistTrackSwipeRow({
  title,
  thumbUrl,
  isActive,
  isPlaying,
  opened,
  onOpenedChange,
  onPlay,
  onDeleteRequest,
  deleteBusy = false,
}: PlaylistTrackSwipeRowProps) {
  const { t } = useI18n();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startOffset: 0, pointerId: -1, moved: false });
  const openRef = useRef(false);
  const suppressClickUntilRef = useRef(0);

  useLayoutEffect(() => {
    openRef.current = opened;
  }, [opened]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const update = () => setContentWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setOffset(opened ? ACTION_WIDTH_PX : 0);
  }, [opened]);

  const suppressClicks = () => {
    suppressClickUntilRef.current = Date.now() + SUPPRESS_CLICK_MS;
  };

  const shouldSuppressClick = () => Date.now() < suppressClickUntilRef.current;

  const setOpen = (next: boolean) => {
    openRef.current = next;
    onOpenedChange(next);
  };

  const snapOffset = (value: number): { offset: number; open: boolean } => {
    if (value >= ACTION_WIDTH_PX / 2) {
      return { offset: ACTION_WIDTH_PX, open: true };
    }
    return { offset: 0, open: false };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startOffset: offset,
      pointerId: e.pointerId,
      moved: false,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || dragRef.current.pointerId !== e.pointerId) return;

    const delta = e.clientX - dragRef.current.startX;
    if (Math.abs(delta) > DRAG_CLICK_THRESHOLD_PX) {
      dragRef.current.moved = true;
    }

    const next = Math.max(
      0,
      Math.min(ACTION_WIDTH_PX, dragRef.current.startOffset + delta),
    );
    setOffset(next);
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || dragRef.current.pointerId !== e.pointerId) return;

    const didMove = dragRef.current.moved;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const { offset: snapped, open } = snapOffset(offset);
    setOffset(snapped);
    setOpen(open);

    if (didMove || open) {
      suppressClicks();
      e.preventDefault();
    }

    dragRef.current.moved = false;
  };

  const handlePlay = () => {
    if (shouldSuppressClick()) return;

    if (openRef.current) {
      setOpen(false);
      return;
    }

    onPlay();
  };

  const handleDeletePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    suppressClicks();
    onDeleteRequest();
    setOpen(false);
  };

  const stopActionPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  return (
    <div className="playlists-list-swipe playlists-track-swipe" ref={rootRef}>
      <div
        className={`playlists-list-swipe-track${dragging ? ' is-dragging' : ''}`}
        style={{
          transform: `translateX(${-ACTION_WIDTH_PX + offset}px)`,
          width: contentWidth > 0 ? contentWidth + ACTION_WIDTH_PX : undefined,
        }}
      >
        <div className="playlists-list-swipe-action playlists-list-swipe-action--delete">
          <button
            type="button"
            className="playlists-list-swipe-action-btn"
            disabled={deleteBusy}
            onPointerDown={stopActionPointer}
            onPointerUp={handleDeletePointerUp}
          >
            {deleteBusy ? t('playlists.removingTrack') : t('playlists.removeTrackShort')}
          </button>
        </div>

        <div
          className={`playlists-list-swipe-content${isActive ? ' active' : ''}`}
          style={{ width: contentWidth > 0 ? contentWidth : undefined }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <button
            type="button"
            className={`playlists-track-main${isActive ? ' active' : ''}${isPlaying ? ' playing' : ''}`}
            onClick={handlePlay}
            title={title}
          >
            <span className="playlists-track-thumb-wrap">
              <img className="playlists-track-thumb" src={thumbUrl} alt="" loading="lazy" draggable={false} />
              <span className="playlists-track-play-icon" aria-hidden>
                {isPlaying ? '▮▮' : '▶'}
              </span>
            </span>
            <span className="playlists-track-title">{title}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
