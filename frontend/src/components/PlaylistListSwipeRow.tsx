import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { useMediaQuery } from '../hooks/useMediaQuery';

const ACTION_WIDTH_PX = 76;
const DRAG_CLICK_THRESHOLD_PX = 6;
const SUPPRESS_CLICK_MS = 700;

export type PlaylistListSwipeSide = 'none' | 'edit' | 'delete';

type PlaylistListSwipeRowProps = {
  isActive: boolean;
  openedSide: PlaylistListSwipeSide;
  onOpenedSideChange: (side: PlaylistListSwipeSide) => void;
  title: string;
  meta: ReactNode;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteBusy?: boolean;
};

export default function PlaylistListSwipeRow({
  isActive,
  openedSide,
  onOpenedSideChange,
  title,
  meta,
  onSelect,
  onEdit,
  onDelete,
  deleteBusy = false,
}: PlaylistListSwipeRowProps) {
  const { t } = useI18n();
  const swipeEnabled = useMediaQuery('(pointer: coarse)');
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startOffset: 0, pointerId: -1, moved: false });
  const openSideRef = useRef<PlaylistListSwipeSide>('none');
  const suppressClickUntilRef = useRef(0);

  useLayoutEffect(() => {
    openSideRef.current = openedSide;
  }, [openedSide]);

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
    if (openedSide === 'edit') setOffset(ACTION_WIDTH_PX);
    else if (openedSide === 'delete') setOffset(-ACTION_WIDTH_PX);
    else setOffset(0);
  }, [openedSide]);

  const snapOffset = (value: number): { offset: number; side: PlaylistListSwipeSide } => {
    if (value <= -ACTION_WIDTH_PX / 2) {
      return { offset: -ACTION_WIDTH_PX, side: 'delete' };
    }
    if (value >= ACTION_WIDTH_PX / 2) {
      return { offset: ACTION_WIDTH_PX, side: 'edit' };
    }
    return { offset: 0, side: 'none' };
  };

  const suppressClicks = () => {
    suppressClickUntilRef.current = Date.now() + SUPPRESS_CLICK_MS;
  };

  const shouldSuppressClick = () => Date.now() < suppressClickUntilRef.current;

  const setOpenSide = (side: PlaylistListSwipeSide) => {
    openSideRef.current = side;
    onOpenedSideChange(side);
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
      -ACTION_WIDTH_PX,
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

    const { offset: snapped, side } = snapOffset(offset);
    setOffset(snapped);
    setOpenSide(side);

    if (didMove || side !== 'none') {
      suppressClicks();
      e.preventDefault();
    }

    dragRef.current.moved = false;
  };

  const handleSelect = () => {
    if (shouldSuppressClick()) return;

    if (openSideRef.current !== 'none') {
      setOpenSide('none');
      return;
    }

    onSelect();
  };

  const runAction = (action: () => void) => {
    suppressClicks();
    action();
    setOpenSide('none');
  };

  const handleEditPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    runAction(onEdit);
  };

  const handleDeletePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    runAction(onDelete);
  };

  const stopActionPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  if (!swipeEnabled) {
    return (
      <button type="button" className="playlists-list-item" onClick={() => onSelect()}>
        <span className="playlists-list-item-body">
          <span className="playlists-list-title">{title}</span>
          <span className="playlists-list-meta">{meta}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="playlists-list-swipe" ref={rootRef}>
      <div
        className={`playlists-list-swipe-track${dragging ? ' is-dragging' : ''}`}
        style={{
          transform: `translateX(${-ACTION_WIDTH_PX + offset}px)`,
          width: contentWidth > 0 ? contentWidth + ACTION_WIDTH_PX * 2 : undefined,
        }}
      >
        <div className="playlists-list-swipe-action playlists-list-swipe-action--edit">
          <button
            type="button"
            className="playlists-list-swipe-action-btn"
            onPointerDown={stopActionPointer}
            onPointerUp={handleEditPointerUp}
          >
            {t('playlists.rename')}
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
          <button type="button" className="playlists-list-item" onClick={handleSelect}>
            <span className="playlists-list-item-body">
              <span className="playlists-list-title">{title}</span>
              <span className="playlists-list-meta">{meta}</span>
            </span>
          </button>
        </div>

        <div className="playlists-list-swipe-action playlists-list-swipe-action--delete">
          <button
            type="button"
            className="playlists-list-swipe-action-btn"
            disabled={deleteBusy}
            onPointerDown={stopActionPointer}
            onPointerUp={handleDeletePointerUp}
          >
            {deleteBusy ? t('playlists.deleting') : t('playlists.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
