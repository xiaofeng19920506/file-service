import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PlaylistItem } from '../../api/playlists';
import {
  formatClipSummary,
  formatClipTime,
  resolvePlayClips,
  type PlayClip,
} from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';
import WorshipClipFields from '../bulletin/WorshipClipFields';

type WorshipClipsModalProps = {
  item: PlaylistItem;
  songTitle: string;
  disabled?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave?: (patch: { playClips: PlayClip[] | null }) => Promise<void>;
  onCleared?: () => void;
};

/** 查看 / 编辑全部剪切段 */
export default function WorshipClipsModal({
  item,
  songTitle,
  disabled = false,
  readOnly = false,
  onClose,
  onSave,
  onCleared,
}: WorshipClipsModalProps) {
  const { t } = useI18n();
  const clips = resolvePlayClips(item);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`worship-clips-modal-title-${item.id}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="metadata-modal worship-clips-modal">
        <div className="metadata-modal-header">
          <h3 id={`worship-clips-modal-title-${item.id}`}>
            {t('bulletin.worshipClipModalTitle')}
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('metadata.close')}
          >
            ×
          </button>
        </div>
        <p className="worship-clips-modal-song" title={songTitle}>
          {songTitle}
        </p>
        <div className="metadata-modal-body worship-clips-modal-body">
          {readOnly || !onSave ? (
            clips.length === 0 ? (
              <p className="playlists-muted">{t('bulletin.worshipClipEmpty')}</p>
            ) : (
              <ul className="worship-clips-modal-list">
                {clips.map((clip, index) => {
                  const label =
                    clip.label?.trim() ||
                    t('bulletin.worshipClipUntitled', { n: index + 1 });
                  const range = `${formatClipTime(clip.startSec) || '0:00'}–${
                    clip.endSec == null ? '—' : formatClipTime(clip.endSec) || '—'
                  }`;
                  return (
                    <li key={`${clip.startSec}-${index}`} className="worship-clips-modal-list-item">
                      <span className="worship-clips-modal-list-title" title={label}>
                        {label}
                      </span>
                      <span className="worship-clips-modal-list-time" title={formatClipSummary(clip)}>
                        {range}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <WorshipClipFields
              item={item}
              disabled={disabled}
              open
              hideToggle
              onSave={onSave}
              onCleared={() => {
                onCleared?.();
                onClose();
              }}
            />
          )}
        </div>
        <div className="metadata-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
