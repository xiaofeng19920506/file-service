import { useEffect, useState } from 'react';
import { addPlaylistItems } from '../api/playlists';
import { friendlyError } from '../lib/error-messages';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import PlaylistYoutubeSearchPanel from './PlaylistYoutubeSearchPanel';
import { useI18n } from '../i18n';
import type { PlaylistDetail } from '../api/playlists';

type AddPlaylistItemsModalProps = {
  playlistId: string;
  existingVideoIds: Set<string>;
  onClose: () => void;
  onAdded: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
};

export default function AddPlaylistItemsModal({
  playlistId,
  existingVideoIds,
  onClose,
  onAdded,
}: AddPlaylistItemsModalProps) {
  const { t } = useI18n();
  const isMobileViewport = useMediaQuery(MOBILE_MEDIA_QUERY);
  const [url, setUrl] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchHeaderEl, setSearchHeaderEl] = useState<HTMLElement | null>(null);

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
      const data = await addPlaylistItems(playlistId, trimmed);
      onAdded(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
      onClose();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'add_playlist_item_failed', t));
      setAddingUrl(false);
    }
  };

  return (
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('playlists.addTitle')}
      onClick={handleCancel}
    >
      <div
        className="metadata-modal add-playlist-items-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metadata-modal-header add-playlist-items-header">
          {isMobileViewport ? (
            <h3 id="add-playlist-items-title">{t('playlists.addTitle')}</h3>
          ) : (
            <div ref={setSearchHeaderEl} className="add-playlist-items-header-search" />
          )}
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

        <form className="metadata-modal-body add-playlist-items-body" onSubmit={(e) => void handleUrlConfirm(e)}>
          <PlaylistYoutubeSearchPanel
            className="add-playlist-items-search"
            playlistId={playlistId}
            existingVideoIds={existingVideoIds}
            onAdded={onAdded}
            searchHeaderEl={isMobileViewport ? null : searchHeaderEl}
          />

          <p className="add-playlist-items-divider" role="presentation">
            {t('playlists.addOrPasteUrl')}
          </p>

          <label className="share-playlist-field">
            <span>{t('playlists.addUrlLabel')}</span>
            <input
              type="url"
              className="playlists-text-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('playlists.addPlaceholder')}
              disabled={addingUrl}
            />
          </label>
          <p className="playlists-muted playlists-add-modal-hint">{t('playlists.addHint')}</p>
          {error && <p className="error-msg">{error}</p>}

          <div className="metadata-modal-actions">
            <button type="button" className="btn-secondary" onClick={handleCancel} disabled={addingUrl}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={addingUrl || !url.trim()}>
              {addingUrl ? t('playlists.adding') : t('playlists.addConfirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
