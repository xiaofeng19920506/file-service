import { useEffect, useRef, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { formatClipSummary, resolvePlayClips, type PlayClip } from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';
import { ChevronDownIcon, ChevronRightIcon } from '../icons';
import WorshipClipFields from '../bulletin/WorshipClipFields';

type WorshipTrackActionsProps = {
  item: PlaylistItem;
  title: string;
  disabled?: boolean;
  onRemove: () => void | Promise<void>;
  onClipSave: (patch: { playClips: PlayClip[] | null }) => Promise<void>;
};

/** 歌名 accordion（展开/收起剪切）+ ⋯（移除） */
export default function WorshipTrackActions({
  item,
  title,
  disabled = false,
  onRemove,
  onClipSave,
}: WorshipTrackActionsProps) {
  const { t } = useI18n();
  const savedClips = resolvePlayClips(item);
  const hasClips = savedClips.length > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  /** 有剪切时默认展开；之后完全由用户 accordion 控制，不被数据刷新强制打开 */
  const [clipOpen, setClipOpen] = useState(() => hasClips);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = `worship-clip-panel-${item.id}`;

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

  const summary = hasClips
    ? savedClips.map((c) => formatClipSummary(c)).join(' · ')
    : null;
  const toggleLabel = clipOpen
    ? t('bulletin.worshipClipCollapse')
    : t('bulletin.worshipClipExpand');

  return (
    <div className={`worship-track-actions${clipOpen ? ' is-open' : ''}`} ref={rootRef}>
      <div className="worship-track-actions-bar">
        <button
          type="button"
          className="worship-track-accordion-trigger"
          disabled={disabled}
          aria-expanded={clipOpen}
          aria-controls={panelId}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => setClipOpen((v) => !v)}
        >
          <span className="worship-track-accordion-affordance" aria-hidden>
            <span className="worship-track-accordion-chevron">
              {clipOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </span>
          </span>
          <span className="worship-track-actions-title" title={title}>
            {title}
          </span>
          {!clipOpen && summary ? (
            <span className="bulletin-worship-clip-summary worship-track-actions-clip-hint" title={summary}>
              {summary}
            </span>
          ) : null}
        </button>
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
                  setClipOpen((v) => !v);
                  setMenuOpen(false);
                }}
              >
                {toggleLabel}
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

      <div
        id={panelId}
        className="worship-track-accordion-panel"
        hidden={!clipOpen}
        role="region"
        aria-label={t('bulletin.worshipClipSegments')}
      >
        {clipOpen ? (
          <WorshipClipFields
            item={item}
            disabled={disabled}
            open
            onOpenChange={setClipOpen}
            hideToggle
            onSave={onClipSave}
          />
        ) : null}
      </div>
    </div>
  );
}
