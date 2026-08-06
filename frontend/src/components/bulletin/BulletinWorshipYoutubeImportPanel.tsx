import { useCallback, useEffect, useState } from 'react';
import {
  fetchYoutubeOAuthStatus,
  listUserYoutubePlaylists,
  startYoutubeOAuth,
  type YoutubeOAuthStatus,
  type YoutubePlaylistSummary,
} from '../../api/youtube-oauth';
import { addBulletinWorshipPlaylistItems, importBulletinWorshipYoutubePlaylist } from '../../api/bulletins';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';
import type { PlaylistDetail } from '../../api/playlists';

type BulletinWorshipYoutubeImportPanelProps = {
  bulletinId: string;
  oauthJustConnected?: boolean;
  oauthError?: string | null;
  onClearOauthError?: () => void;
  onImported: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
};

export default function BulletinWorshipYoutubeImportPanel({
  bulletinId,
  oauthJustConnected = false,
  oauthError = null,
  onClearOauthError,
  onImported,
}: BulletinWorshipYoutubeImportPanelProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<YoutubeOAuthStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [playlists, setPlaylists] = useState<YoutubePlaylistSummary[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [url, setUrl] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
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
    } else {
      setPlaylists([]);
      setSelectedId(null);
    }
  }, [status?.connected, status?.dataApiReady, loadPlaylists]);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    onClearOauthError?.();
    try {
      const { url: oauthUrl } = await startYoutubeOAuth({ returnHash: '/bulletin' });
      window.location.href = oauthUrl;
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
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_import_failed', t));
    } finally {
      setImporting(false);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || addingUrl) return;
    setAddingUrl(true);
    setError(null);
    try {
      const data = await addBulletinWorshipPlaylistItems(bulletinId, trimmed);
      onImported(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'add_playlist_item_failed', t));
      setAddingUrl(false);
    }
  };

  const urlForm = (
    <form className="bulletin-worship-youtube-url-form" onSubmit={(e) => void handleUrlSubmit(e)}>
      <h4 className="bulletin-worship-youtube-section-title">{t('playlists.addUrlLabel')}</h4>
      <label className="share-playlist-field">
        <input
          type="url"
          className="playlists-text-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('playlists.addPlaceholder')}
          disabled={addingUrl || importing}
        />
      </label>
      <p className="playlists-muted playlists-add-modal-hint">{t('worshipSongs.urlHint')}</p>
      <button type="submit" className="btn-primary" disabled={addingUrl || importing || !url.trim()}>
        {addingUrl ? t('playlists.adding') : t('playlists.addConfirm')}
      </button>
    </form>
  );

  if (loadingStatus) {
    return (
      <div className="bulletin-worship-youtube-import">
        {urlForm}
        <p className="playlists-muted">{t('bulletin.worshipImportYoutubeLoadingLists')}</p>
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="bulletin-worship-youtube-import">
        {urlForm}
        <p className="error-msg">{friendlyError('youtube_oauth_not_configured', t)}</p>
        {error && <p className="error-msg">{error}</p>}
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="bulletin-worship-youtube-import">
        {urlForm}
        <div className="bulletin-worship-youtube-connect">
          <h4 className="bulletin-worship-youtube-section-title">
            {t('bulletin.worshipAddSongsTabYoutubePlaylists')}
          </h4>
          <p className="bulletin-worship-youtube-connect-hint">{t('bulletin.worshipImportYoutubeConnectHint')}</p>
          <button
            type="button"
            className="btn-primary bulletin-worship-action-btn"
            onClick={() => void handleConnect()}
            disabled={connecting || addingUrl}
          >
            {connecting ? t('playlists.exportYoutubeConnecting') : t('bulletin.worshipImportYoutubeConnect')}
          </button>
          {error && <p className="error-msg">{error}</p>}
        </div>
      </div>
    );
  }

  if (!status.dataApiReady) {
    const reason = status.dataApiError
      ? friendlyError(status.dataApiError, t)
      : t('bulletin.worshipImportYoutubeUnavailable');
    const needsReconnect =
      status.dataApiError === 'youtube_token_refresh_failed' ||
      status.dataApiError === 'youtube_not_connected' ||
      status.dataApiError === 'oauth_invalid_grant';
    return (
      <div className="bulletin-worship-youtube-import">
        {urlForm}
        <div className="bulletin-worship-youtube-unavailable">
          <p className="error-msg">{reason}</p>
          {status.dataApiError === 'youtube_api_not_enabled' ? (
            <p className="export-youtube-hint">{t('playlists.exportYoutubeApiEnableHint')}</p>
          ) : null}
          {needsReconnect ? (
            <button
              type="button"
              className="btn-primary bulletin-worship-action-btn"
              onClick={() => void handleConnect()}
              disabled={connecting || addingUrl}
            >
              {connecting
                ? t('playlists.exportYoutubeConnecting')
                : t('bulletin.worshipImportYoutubeReconnect')}
            </button>
          ) : null}
          <p className="playlists-muted">{t('bulletin.worshipImportYoutubeFallbackHint')}</p>
          {error && <p className="error-msg">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="bulletin-worship-youtube-import">
      {urlForm}

      <div className="bulletin-worship-youtube-import-lists">
        <h4 className="bulletin-worship-youtube-section-title">
          {t('bulletin.worshipAddSongsTabYoutubePlaylists')}
        </h4>
        {loadingPlaylists ? (
          <p className="playlists-muted">{t('bulletin.worshipImportYoutubeLoadingLists')}</p>
        ) : playlists.length === 0 ? (
          <p className="playlists-muted">{t('bulletin.worshipImportYoutubeEmpty')}</p>
        ) : (
          <>
            <ul className="bulletin-worship-youtube-pick-list">
              {playlists.map((row) => (
                <li key={row.id}>
                  <label className="bulletin-worship-youtube-pick">
                    <input
                      type="radio"
                      name="bulletin-youtube-playlist"
                      checked={selectedId === row.id}
                      onChange={() => setSelectedId(row.id)}
                      disabled={importing || addingUrl}
                    />
                    <span className="bulletin-worship-youtube-pick-title">{row.title}</span>
                    <span className="bulletin-worship-youtube-pick-meta">
                      {t('bulletin.worshipImportYoutubeTrackCount', { count: row.itemCount })}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="bulletin-worship-youtube-import-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleImport()}
                disabled={importing || addingUrl || !selectedId}
              >
                {importing
                  ? t('bulletin.worshipImportYoutubeImporting')
                  : t('bulletin.worshipImportYoutubeConfirm')}
              </button>
            </div>
          </>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}
