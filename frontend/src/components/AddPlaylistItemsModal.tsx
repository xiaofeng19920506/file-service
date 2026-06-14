import { useEffect, useState } from 'react';
import { addPlaylistItems, addPlaylistItemsByVideos } from '../api/playlists';
import { friendlyError } from '../lib/error-messages';
import { useDebouncedYoutubeSearch } from '../hooks/useDebouncedYoutubeSearch';
import { SearchIcon } from './icons';
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
  const [url, setUrl] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    hasSearched,
    searchNow,
  } = useDebouncedYoutubeSearch();

  const busy = addingUrl || addingVideoId !== null;

  const handleCancel = () => {
    if (busy) return;
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

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

  const handleAddSearchResult = async (videoId: string, title: string) => {
    if (addingVideoId || existingVideoIds.has(videoId)) return;

    setAddingVideoId(videoId);
    setError(null);
    try {
      const data = await addPlaylistItemsByVideos(playlistId, [{ videoId, title }]);
      onAdded(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'add_playlist_item_failed', t));
    } finally {
      setAddingVideoId(null);
    }
  };

  return (
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-playlist-items-title"
      onClick={handleCancel}
    >
      <div
        className="metadata-modal add-playlist-items-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metadata-modal-header">
          <h3 id="add-playlist-items-title">{t('playlists.addTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleCancel}
            aria-label={t('metadata.close')}
            disabled={busy}
          >
            ×
          </button>
        </div>

        <form className="metadata-modal-body add-playlist-items-body" onSubmit={(e) => void handleUrlConfirm(e)}>
          <section className="add-playlist-items-search" aria-label={t('playlists.searchSection')}>
            <div className="search-box">
              <div className="search-input-wrap">
                <SearchIcon />
                <input
                  type="search"
                  className="search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchNow();
                    }
                  }}
                  placeholder={t('playlists.searchPlaceholder')}
                  autoFocus
                  disabled={busy}
                  enterKeyHint="search"
                />
              </div>
              <button
                type="button"
                className="btn-secondary btn-search"
                onClick={searchNow}
                disabled={searchLoading || busy}
              >
                {searchLoading ? t('search.searching') : t('search.button')}
              </button>
            </div>
            <p className="playlists-muted playlists-add-modal-hint">{t('playlists.searchHint')}</p>
            {(searchError || error) && (
              <p className="error-msg">{searchError ?? error}</p>
            )}
            {!searchLoading && hasSearched && searchResults.length === 0 && !searchError && (
              <p className="search-empty">{t('playlists.searchNoResults')}</p>
            )}
            {searchResults.length > 0 && (
              <ul className="search-results youtube-search-results">
                {searchResults.map((row) => {
                  const inList = existingVideoIds.has(row.videoId);
                  const adding = addingVideoId === row.videoId;
                  return (
                    <li key={row.videoId} className="search-result-item search-result-card youtube-search-result">
                      {row.thumbnailUrl && (
                        <img
                          className="youtube-search-thumb"
                          src={row.thumbnailUrl}
                          alt=""
                          loading="lazy"
                        />
                      )}
                      <div className="search-result-main">
                        <strong className="search-result-title">{row.title}</strong>
                        {row.channelTitle && (
                          <div className="search-result-meta">
                            <span className="meta-tag">{row.channelTitle}</span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`btn-secondary btn-add${inList ? ' added' : ''}`}
                        onClick={() => void handleAddSearchResult(row.videoId, row.title)}
                        disabled={inList || busy}
                      >
                        {inList
                          ? t('search.added')
                          : adding
                            ? t('playlists.adding')
                            : t('search.add')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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
              disabled={busy}
            />
          </label>
          <p className="playlists-muted playlists-add-modal-hint">{t('playlists.addHint')}</p>

          <div className="metadata-modal-actions">
            <button type="button" className="btn-secondary" onClick={handleCancel} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !url.trim()}>
              {addingUrl ? t('playlists.adding') : t('playlists.addConfirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
