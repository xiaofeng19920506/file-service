import { useEffect, useState } from 'react';
import { addBulletinWorshipPlaylistItems } from '../api/bulletins';
import { addPlaylistItems } from '../api/playlists';
import { friendlyError } from '../lib/error-messages';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import PlaylistYoutubeSearchPanel from './PlaylistYoutubeSearchPanel';
import { useI18n } from '../i18n';
import type { PlaylistDetail } from '../api/playlists';

type AddPlaylistItemsModalProps = {
  /** 普通歌单：按 playlistId 添加 */
  playlistId?: string;
  /** 周报敬拜歌单：按 bulletinId 添加（与 playlistId 二选一） */
  bulletinId?: string;
  existingVideoIds: Set<string>;
  onClose: () => void;
  onAdded: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
};

export default function AddPlaylistItemsModal({
  playlistId,
  bulletinId,
  existingVideoIds,
  onClose,
  onAdded,
}: AddPlaylistItemsModalProps) {
  const { t } = useI18n();
  const isMobileViewport = useMediaQuery(MOBILE_MEDIA_QUERY);
  const [url, setUrl] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = () => {
    if (addingUrl) return;
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !addingUrl) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addingUrl, onClose]);

  const handleUrlConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || addingUrl) return;

    setAddingUrl(true);
    setError(null);
    try {
      const data = bulletinId
        ? await addBulletinWorshipPlaylistItems(bulletinId, trimmed)
        : await addPlaylistItems(playlistId!, trimmed);
      onAdded(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
      onClose();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'add_playlist_item_failed', t));
      setAddingUrl(false);
    }
  };

  const urlPanel = (
    <form
      className="add-playlist-items-url-form"
      onSubmit={(e) => void handleUrlConfirm(e)}
    >
      {!isMobileViewport && (
        <h4 className="add-playlist-items-col-title">{t('playlists.addUrlLabel')}</h4>
      )}

      {isMobileViewport && (
        <p className="add-playlist-items-divider" role="presentation">
          {t('playlists.addOrPasteUrl')}
        </p>
      )}

      <label className="share-playlist-field">
        {isMobileViewport && <span>{t('playlists.addUrlLabel')}</span>}
        <input
          type="url"
          className="playlists-text-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('playlists.addPlaceholder')}
          disabled={addingUrl}
        />
      </label>
      <p className="playlists-muted playlists-add-modal-hint">
        {bulletinId ? t('worshipSongs.urlHint') : t('playlists.addHint')}
      </p>
      {error && <p className="error-msg">{error}</p>}

      <div className="metadata-modal-actions add-playlist-items-url-actions">
        <button type="button" className="btn-secondary" onClick={handleCancel} disabled={addingUrl}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn-primary" disabled={addingUrl || !url.trim()}>
          {addingUrl ? t('playlists.adding') : t('playlists.addConfirm')}
        </button>
      </div>
    </form>
  );

  return (
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('playlists.addTitle')}
      onClick={handleCancel}
    >
      <div
        className={`metadata-modal add-playlist-items-modal${isMobileViewport ? '' : ' add-playlist-items-modal--split'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metadata-modal-header add-playlist-items-header">
          <h3 id="add-playlist-items-title">{t('playlists.addTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleCancel}
            aria-label={t('metadata.close')}
            disabled={addingUrl}
          >
            ×
          </button>
        </div>

        <div className="add-playlist-items-layout">
          <section
            className="add-playlist-items-col add-playlist-items-col--search"
            aria-label={t('playlists.searchSection')}
          >
            {!isMobileViewport && (
              <h4 className="add-playlist-items-col-title">{t('playlists.searchSection')}</h4>
            )}
            <PlaylistYoutubeSearchPanel
              className="add-playlist-items-search"
              playlistId={bulletinId ? undefined : playlistId}
              bulletinId={bulletinId}
              existingVideoIds={existingVideoIds}
              onAdded={onAdded}
              resultLayout={bulletinId ? 'video' : 'list'}
            />
          </section>

          <section
            className="add-playlist-items-col add-playlist-items-col--url"
            aria-label={t('playlists.addUrlLabel')}
          >
            {urlPanel}
          </section>
        </div>
      </div>
    </div>
  );
}
