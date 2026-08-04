import { useEffect, useRef, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { formatClipSummary, resolvePlayClips, type PlayClip } from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';
import WorshipClipFields from '../bulletin/WorshipClipFields';

type WorshipTrackActionsProps = {
  item: PlaylistItem;
  title: string;
  disabled?: boolean;
  onRemove: () => void | Promise<void>;
  onClipSave: (patch: { playClips: PlayClip[] | null }) => Promise<void>;
};

/** 歌名 + ⋯（剪切 / 移除）+ 按需展开的剪切编辑 */
export default function WorshipTrackActions({
  item,
  title,
  disabled = false,
  onRemove,
  onClipSave,
}: WorshipTrackActionsProps) {
  const { t } = useI18n();
  const savedClips = resolvePlayClips(item);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clipOpen, setClipOpen] = useState(() => savedClips.length > 0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resolvePlayClips(item).length > 0) setClipOpen(true);
  }, [item.id, item.playClips, item.playStartSec, item.playEndSec]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="worship-track-actions" ref={rootRef}>
      <div className="worship-track-actions-bar">
        <span className="worship-track-actions-title">{title}</span>
        {!clipOpen && savedClips.length > 0 ? (
          <span className="bulletin-worship-clip-summary worship-track-actions-clip-hint">
            {savedClips.map((c) => formatClipSummary(c)).join(' · ')}
          </span>
        ) : null}
        <div className="worship-track-more">
          <button
            type="button"
            className="worship-track-more-btn"
            disabled={disabled}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={t('bulletin.worshipTrackMore')}
            title={t('bulletin.worshipTrackMore')}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="worship-track-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="worship-track-more-item"
                disabled={disabled}
                onClick={() => {
                  setClipOpen(true);
                  setMenuOpen(false);
                }}
              >
                {t('bulletin.worshipClipShow')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="worship-track-more-item worship-track-more-item--danger"
                disabled={disabled}
                onClick={() => {
                  setMenuOpen(false);
                  void onRemove();
                }}
              >
                {t('playlists.removeTrackShort')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <WorshipClipFields
        item={item}
        disabled={disabled}
        open={clipOpen}
        onOpenChange={setClipOpen}
        hideToggle
        onSave={onClipSave}
      />
    </div>
  );
}
