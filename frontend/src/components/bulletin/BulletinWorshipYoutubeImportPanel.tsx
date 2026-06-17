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
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_import_failed', t));
    } finally {
      setImporting(false);
    }
  };

  if (loadingStatus) {
    return <p className="playlists-muted">{t('bulletin.worshipImportYoutubeLoadingLists')}</p>;
  }

  if (!status?.configured) {
    return <p className="error-msg">{friendlyError('youtube_oauth_not_configured', t)}</p>;
  }

  if (!status.connected) {
    return (
      <div className="bulletin-worship-youtube-connect">
        <p className="bulletin-worship-youtube-connect-hint">{t('bulletin.worshipImportYoutubeConnectHint')}</p>
        <button
          type="button"
          className="btn-primary bulletin-worship-action-btn"
          onClick={() => void handleConnect()}
          disabled={connecting}
        >
          {connecting ? t('playlists.exportYoutubeConnecting') : t('bulletin.worshipImportYoutubeConnect')}
        </button>
        {error && <p className="error-msg">{error}</p>}
      </div>
    );
  }

  if (!status.dataApiReady) {
    return <p className="error-msg">{t('bulletin.worshipImportYoutubeUnavailable')}</p>;
  }

  if (loadingPlaylists) {
    return <p className="playlists-muted">{t('bulletin.worshipImportYoutubeLoadingLists')}</p>;
  }

  if (playlists.length === 0) {
    return <p className="playlists-muted">{t('bulletin.worshipImportYoutubeEmpty')}</p>;
  }

  return (
    <div className="bulletin-worship-youtube-import">
      <ul className="bulletin-worship-youtube-pick-list">
        {playlists.map((row) => (
          <li key={row.id}>
            <label className="bulletin-worship-youtube-pick">
              <input
                type="radio"
                name="bulletin-youtube-playlist"
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

      <div className="bulletin-worship-youtube-import-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleImport()}
          disabled={importing || !selectedId}
        >
          {importing ? t('bulletin.worshipImportYoutubeImporting') : t('bulletin.worshipImportYoutubeConfirm')}
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}
