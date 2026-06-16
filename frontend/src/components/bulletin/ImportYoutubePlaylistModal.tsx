import { useCallback, useEffect, useState } from 'react';
import {
  fetchYoutubeOAuthStatus,
  listUserYoutubePlaylists,
  startYoutubeOAuth,
  type YoutubeOAuthStatus,
  type YoutubePlaylistSummary,
} from '../../api/youtube-oauth';
import { importBulletinWorshipYoutubePlaylist } from '../../api/bulletins';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';
import type { PlaylistDetail } from '../../api/playlists';

type ImportYoutubePlaylistModalProps = {
  bulletinId: string;
  onClose: () => void;
  onImported: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
  oauthJustConnected?: boolean;
  oauthError?: string | null;
};

export default function ImportYoutubePlaylistModal({
  bulletinId,
  onClose,
  onImported,
  oauthJustConnected = false,
  oauthError = null,
}: ImportYoutubePlaylistModalProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<YoutubeOAuthStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [playlists, setPlaylists] = useState<YoutubePlaylistSummary[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setError(null);
    try {
      const data = await fetchYoutubeOAuthStatus();
      setStatus(data);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_oauth_status_failed', t));
    } finally {
      setLoadingStatus(false);
    }
  }, [t]);

  const loadPlaylists = useCallback(async () => {
    setLoadingPlaylists(true);
    setError(null);
    try {
      const data = await listUserYoutubePlaylists();
      setPlaylists(data.playlists);
      if (!selectedId && data.playlists[0]) {
        setSelectedId(data.playlists[0].id);
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_import_failed', t));
    } finally {
      setLoadingPlaylists(false);
    }
  }, [selectedId, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, oauthJustConnected]);

  useEffect(() => {
    if (oauthError) setError(oauthError);
  }, [oauthError]);

  useEffect(() => {
    if (status?.connected && status.dataApiReady) {
      void loadPlaylists();
    }
  }, [status?.connected, status?.dataApiReady, loadPlaylists]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !importing && !connecting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [connecting, importing, onClose]);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const { url } = await startYoutubeOAuth({ returnHash: '/bulletin' });
      window.location.href = url;
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_oauth_start_failed', t));
      setConnecting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedId || importing) return;
    setImporting(true);
    setError(null);
    try {
      const data = await importBulletinWorshipYoutubePlaylist(bulletinId, selectedId);
      onImported(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
      onClose();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_import_failed', t));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal bulletin-worship-import-modal">
        <header className="metadata-modal-header">
          <h3>{t('bulletin.worshipImportYoutubeTitle')}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={importing}>
            ×
          </button>
        </header>

        <div className="metadata-modal-body">
          {loadingStatus ? (
            <p className="playlists-muted">{t('bulletin.worshipImportYoutubeLoadingLists')}</p>
          ) : !status?.configured ? (
            <p className="error-msg">{friendlyError('youtube_oauth_not_configured', t)}</p>
          ) : !status.connected ? (
            <button
              type="button"
              className="btn-primary bulletin-worship-action-btn"
              onClick={() => void handleConnect()}
              disabled={connecting}
            >
              {connecting ? t('playlists.exportYoutubeConnecting') : t('bulletin.worshipImportYoutubeConnect')}
            </button>
          ) : !status.dataApiReady ? (
            <p className="error-msg">{t('bulletin.worshipImportYoutubeUnavailable')}</p>
          ) : loadingPlaylists ? (
            <p className="playlists-muted">{t('bulletin.worshipImportYoutubeLoadingLists')}</p>
          ) : playlists.length === 0 ? (
            <p className="playlists-muted">{t('bulletin.worshipImportYoutubeEmpty')}</p>
          ) : (
            <ul className="bulletin-worship-youtube-pick-list">
              {playlists.map((row) => (
                <li key={row.id}>
                  <label className="bulletin-worship-youtube-pick">
                    <input
                      type="radio"
                      name="youtube-playlist"
                      checked={selectedId === row.id}
                      onChange={() => setSelectedId(row.id)}
                      disabled={importing}
                    />
                    <span className="bulletin-worship-youtube-pick-title">{row.title}</span>
                    <span className="bulletin-worship-youtube-pick-meta">
                      {t('bulletin.worshipImportYoutubeTrackCount', { count: row.itemCount })}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="error-msg">{error}</p>}
        </div>

        <footer className="metadata-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={importing}>
            {t('common.cancel')}
          </button>
          {status?.connected && status.dataApiReady && playlists.length > 0 && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleImport()}
              disabled={importing || !selectedId}
            >
              {importing ? t('bulletin.worshipImportYoutubeImporting') : t('bulletin.worshipImportYoutubeConfirm')}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
