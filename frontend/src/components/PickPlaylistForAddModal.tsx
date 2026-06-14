import { useEffect, useState } from 'react';
import type { PlaylistDetail, PlaylistSummary } from '../api/playlists';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type PickPlaylistForAddModalProps = {
  videoTitle: string;
  playlists: PlaylistSummary[];
  loadingPlaylists?: boolean;
  busy?: boolean;
  onClose: () => void;
  onPick: (playlistId: string) => Promise<void>;
  onCreatePlaylist: (title: string) => Promise<PlaylistDetail>;
};

export default function PickPlaylistForAddModal({
  videoTitle,
  playlists,
  loadingPlaylists = false,
  busy = false,
  onClose,
  onPick,
  onCreatePlaylist,
}: PickPlaylistForAddModalProps) {
  const { t } = useI18n();
  const [newListTitle, setNewListTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !creating) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, creating, onClose]);

  const handlePick = async (playlistId: string) => {
    if (busy || creating) return;
    setError(null);
    try {
      await onPick(playlistId);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'add_playlist_item_failed', t));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newListTitle.trim();
    if (!title || busy || creating) return;

    setCreating(true);
    setError(null);
    try {
      const created = await onCreatePlaylist(title);
      setNewListTitle('');
      await onPick(created.playlist.id);
    } catch (err) {
      setError(
        friendlyError(err instanceof Error ? err.message : 'create_playlist_failed', t),
      );
    } finally {
      setCreating(false);
    }
  };

  const disabled = busy || creating;

  return (
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pick-playlist-for-add-title"
      onClick={disabled ? undefined : onClose}
    >
      <div
        className="metadata-modal pick-playlist-for-add-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metadata-modal-header">
          <h3 id="pick-playlist-for-add-title">{t('playlists.pickPlaylistTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('metadata.close')}
            disabled={disabled}
          >
            ×
          </button>
        </div>

        <div className="metadata-modal-body pick-playlist-for-add-body">
          <p className="pick-playlist-for-add-song" title={videoTitle}>
            {videoTitle}
          </p>

          {loadingPlaylists ? (
            <p className="playlists-muted">{t('playlists.loading')}</p>
          ) : playlists.length === 0 ? (
            <p className="playlists-muted">{t('playlists.pickPlaylistEmpty')}</p>
          ) : (
            <ul className="pick-playlist-for-add-list">
              {playlists.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="pick-playlist-for-add-item"
                    onClick={() => void handlePick(row.id)}
                    disabled={disabled}
                  >
                    <span className="pick-playlist-for-add-item-title">{row.title}</span>
                    <span className="pick-playlist-for-add-item-meta">
                      {t('playlists.trackCount', { count: row.itemCount })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="pick-playlist-for-add-create">
            <p className="pick-playlist-for-add-create-label">{t('playlists.pickPlaylistCreateNew')}</p>
            <form className="pick-playlist-for-add-create-form" onSubmit={(e) => void handleCreate(e)}>
              <input
                type="text"
                className="playlists-text-input"
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder={t('playlists.createPlaceholder')}
                disabled={disabled}
                maxLength={200}
                autoComplete="off"
                aria-label={t('playlists.createPlaceholder')}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={disabled || !newListTitle.trim()}
              >
                {creating ? t('playlists.creating') : t('playlists.importButton')}
              </button>
            </form>
          </div>

          {error && <p className="error-msg">{error}</p>}
        </div>

        <div className="metadata-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={disabled}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
