import { useEffect, useRef, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { formatClipSummary, resolvePlayClips, type PlayClip } from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';
import { ChevronDownIcon, ChevronRightIcon } from '../icons';
import WorshipClipFields from '../bulletin/WorshipClipFields';
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
 * 歌曲 accordion：标题行 = 箭头 + 缩略图 + 歌名（过长省略）
 * 展开后：歌曲信息；仅在有剪切时显示切片二级 accordion
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
  const [clipsOpen, setClipsOpen] = useState(false);
  /** 无剪切时，用户点「添加剪切」才临时打开编辑器 */
  const [addingClips, setAddingClips] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const songPanelId = `worship-song-panel-${item.id}`;
  const clipsPanelId = `worship-clips-panel-${item.id}`;

  const showClipsSection = hasClips || addingClips;

  useEffect(() => {
    if (!hasClips) {
      setClipsOpen(false);
    }
  }, [hasClips]);

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
  const clipSummary = hasClips
    ? savedClips.map((c) => formatClipSummary(c)).join(' · ')
    : '';

  const closeClipsSection = () => {
    setClipsOpen(false);
    setAddingClips(false);
  };

  return (
    <div
      className={`worship-track-card${songOpen ? ' is-open' : ''}${clipsOpen ? ' is-clips-open' : ''}`}
      ref={rootRef}
    >
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
                {!hasClips && onClipSave ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="worship-track-more-item"
                    disabled={disabled}
                    onClick={() => {
                      setMenuOpen(false);
                      setSongOpen(true);
                      setAddingClips(true);
                      setClipsOpen(true);
                    }}
                  >
                    {t('bulletin.worshipClipAdd')}
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

            {!showClipsSection && !readOnly && onClipSave ? (
              <button
                type="button"
                className="btn-secondary btn-sm worship-track-add-clips-btn"
                disabled={disabled}
                onClick={() => {
                  setAddingClips(true);
                  setClipsOpen(true);
                }}
              >
                {t('bulletin.worshipClipAdd')}
              </button>
            ) : null}

            {showClipsSection ? (
              <div className="worship-track-clips-accordion">
                {hasClips && !clipsOpen ? (
                  <p className="worship-track-card-clip-summary" title={clipSummary}>
                    {clipSummary}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="worship-track-clips-trigger"
                  disabled={disabled}
                  aria-expanded={clipsOpen}
                  aria-controls={clipsPanelId}
                  aria-label={
                    clipsOpen
                      ? t('bulletin.worshipClipCollapse')
                      : t('bulletin.worshipClipExpand')
                  }
                  title={t('bulletin.worshipClipSegments')}
                  onClick={() => setClipsOpen((v) => !v)}
                >
                  <span className="worship-track-clips-chevron" aria-hidden>
                    {clipsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </span>
                  <span className="worship-track-clips-label">
                    {t('bulletin.worshipClipSegments')}
                  </span>
                  {hasClips ? (
                    <span className="worship-track-clips-count">{savedClips.length}</span>
                  ) : null}
                </button>

                <div
                  id={clipsPanelId}
                  className="worship-track-clips-panel"
                  hidden={!clipsOpen}
                >
                  {clipsOpen ? (
                    readOnly || !onClipSave ? (
                      <ul className="worship-track-clips-readonly">
                        {savedClips.map((clip, index) => (
                          <li key={`${clip.startSec}-${index}`}>
                            {formatClipSummary(clip)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <WorshipClipFields
                        item={item}
                        disabled={disabled}
                        open
                        hideToggle
                        compactList
                        onSave={onClipSave}
                        onCleared={closeClipsSection}
                        onOpenChange={(open) => {
                          if (!open) closeClipsSection();
                        }}
                      />
                    )
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
