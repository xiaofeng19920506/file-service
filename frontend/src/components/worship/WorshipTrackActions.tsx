import { useEffect, useRef, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import {
  formatClipSummary,
  formatClipTime,
  resolvePlayClips,
  type PlayClip,
} from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';
import { ChevronDownIcon, ChevronRightIcon } from '../icons';
import WorshipClipsModal from './WorshipClipsModal';
import WorshipTrackThumbnail from './WorshipTrackThumbnail';

type WorshipTrackActionsProps = {
  item: PlaylistItem;
  title: string;
  disabled?: boolean;
  /** 只读：不可编辑剪切 / 移除 */
  readOnly?: boolean;
  onRemove?: () => void | Promise<void>;
  onClipSave?: (patch: { playClips: PlayClip[] | null }) => Promise<void>;
};

/**
 * 歌曲 accordion：标题行 = 箭头 + 缩略图 + 歌名
 * 展开后：歌曲信息 + 切片标签 +「查看切片」打开 modal
 */
export default function WorshipTrackActions({
  item,
  title,
  disabled = false,
  readOnly = false,
  onRemove,
  onClipSave,
}: WorshipTrackActionsProps) {
  const { t } = useI18n();
  const savedClips = resolvePlayClips(item);
  const hasClips = savedClips.length > 0;
  const [songOpen, setSongOpen] = useState(false);
  const [clipsModalOpen, setClipsModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const songPanelId = `worship-song-panel-${item.id}`;

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

  const composer = item.blob?.composer?.trim() || '';
  const author = item.blob?.author?.trim() || '';
  const titleZh = item.blob?.titleZhCn?.trim() || item.blob?.titleZhTw?.trim() || '';

  const openClipsModal = () => {
    setMenuOpen(false);
    setSongOpen(true);
    setClipsModalOpen(true);
  };

  const removeClipAt = (index: number) => {
    if (!onClipSave || readOnly || disabled) return;
    const next = savedClips.filter((_, i) => i !== index);
    void onClipSave({ playClips: next.length > 0 ? next : null });
  };

  const canEditClips = Boolean(!readOnly && onClipSave);

  return (
    <div className={`worship-track-card${songOpen ? ' is-open' : ''}`} ref={rootRef}>
      <div className="worship-track-card-header">
        <button
          type="button"
          className="worship-track-card-trigger"
          disabled={disabled}
          aria-expanded={songOpen}
          aria-controls={songPanelId}
          onClick={() => setSongOpen((v) => !v)}
        >
          <span className="worship-track-card-chevron" aria-hidden>
            {songOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </span>
          <WorshipTrackThumbnail videoId={item.youtubeVideoId} title={title} />
          <span className="worship-track-card-title" title={title}>
            {title}
          </span>
        </button>
        {!readOnly ? (
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
                {onClipSave ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="worship-track-more-item"
                    disabled={disabled}
                    onClick={openClipsModal}
                  >
                    {hasClips ? t('bulletin.worshipClipView') : t('bulletin.worshipClipAdd')}
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="worship-track-more-item worship-track-more-item--danger"
                  disabled={disabled || !onRemove}
                  onClick={() => {
                    setMenuOpen(false);
                    void onRemove?.();
                  }}
                >
                  {t('playlists.removeTrackShort')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        id={songPanelId}
        className="worship-track-card-panel"
        hidden={!songOpen}
        role="region"
        aria-label={title}
      >
        {songOpen ? (
          <div className="worship-track-card-body">
            <dl className="worship-track-song-meta">
              <div className="worship-track-song-meta-row">
                <dt>{t('bulletin.worshipSongTitle')}</dt>
                <dd title={title}>{title}</dd>
              </div>
              {titleZh && titleZh !== title ? (
                <div className="worship-track-song-meta-row">
                  <dt>{t('library.titleZhCn')}</dt>
                  <dd title={titleZh}>{titleZh}</dd>
                </div>
              ) : null}
              {composer ? (
                <div className="worship-track-song-meta-row">
                  <dt>{t('bulletin.worshipSongComposer')}</dt>
                  <dd title={composer}>{composer}</dd>
                </div>
              ) : null}
              {author ? (
                <div className="worship-track-song-meta-row">
                  <dt>{t('bulletin.worshipSongAuthor')}</dt>
                  <dd title={author}>{author}</dd>
                </div>
              ) : null}
              {item.youtubeUrl ? (
                <div className="worship-track-song-meta-row">
                  <dt>{t('bulletin.worshipSongYoutube')}</dt>
                  <dd>
                    <a
                      href={item.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="worship-track-song-link"
                    >
                      {item.youtubeVideoId}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>

            {hasClips ? (
              <div className="worship-track-clip-tags" aria-label={t('bulletin.worshipClipSegments')}>
                {savedClips.map((clip, index) => {
                  const label =
                    clip.label?.trim() ||
                    t('bulletin.worshipClipUntitled', { n: index + 1 });
                  const range = `${formatClipTime(clip.startSec) || '0:00'}–${
                    clip.endSec == null ? '—' : formatClipTime(clip.endSec) || '—'
                  }`;
                  return (
                    <span
                      key={`${clip.startSec}-${index}`}
                      className="worship-track-clip-tag"
                      title={formatClipSummary(clip)}
                    >
                      <span className="worship-track-clip-tag-label">{label}</span>
                      <span className="worship-track-clip-tag-time">{range}</span>
                      {canEditClips ? (
                        <button
                          type="button"
                          className="worship-track-clip-tag-remove"
                          disabled={disabled}
                          aria-label={t('bulletin.worshipClipRemoveSegment')}
                          title={t('bulletin.worshipClipRemoveSegment')}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeClipAt(index);
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            ) : null}

            <div className="worship-track-card-actions">
              {canEditClips ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={disabled}
                  onClick={openClipsModal}
                >
                  {t('bulletin.worshipClipAdd')}
                </button>
              ) : null}
              {hasClips ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={disabled}
                  onClick={openClipsModal}
                >
                  {t('bulletin.worshipClipView')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {clipsModalOpen ? (
        <WorshipClipsModal
          item={item}
          songTitle={title}
          disabled={disabled}
          readOnly={readOnly || !onClipSave}
          onClose={() => setClipsModalOpen(false)}
          onSave={onClipSave}
        />
      ) : null}
    </div>
  );
}
