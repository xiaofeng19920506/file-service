import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';

const ACTION_WIDTH_PX = 76;
const DRAG_CLICK_THRESHOLD_PX = 6;

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
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startOffset: 0, pointerId: -1, moved: false });

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

    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const { offset: snapped, side } = snapOffset(offset);
    setOffset(snapped);
    onOpenedSideChange(side);
  };

  const handleSelect = () => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }

    if (openedSide !== 'none') {
      onOpenedSideChange('none');
      return;
    }

    onSelect();
  };

  return (
    <div className="playlists-list-swipe">
      <div className="playlists-list-swipe-action playlists-list-swipe-action--edit">
        <button
          type="button"
          className="playlists-list-swipe-action-btn"
          onClick={() => {
            onOpenedSideChange('none');
            onEdit();
          }}
        >
          {t('playlists.rename')}
        </button>
      </div>
      <div className="playlists-list-swipe-action playlists-list-swipe-action--delete">
        <button
          type="button"
          className="playlists-list-swipe-action-btn"
          disabled={deleteBusy}
          onClick={() => {
            onOpenedSideChange('none');
            onDelete();
          }}
        >
          {deleteBusy ? t('playlists.deleting') : t('playlists.delete')}
        </button>
      </div>
      <div
        className={`playlists-list-swipe-panel${dragging ? ' is-dragging' : ''}${isActive ? ' active' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
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
    </div>
  );
}
