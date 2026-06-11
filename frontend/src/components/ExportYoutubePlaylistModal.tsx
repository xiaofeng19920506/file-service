import { useCallback, useEffect, useState } from 'react';
import {
  disconnectYoutubeOAuth,
  exportPlaylistToYoutube,
  fetchYoutubeOAuthStatus,
  startYoutubeOAuth,
  type YoutubeOAuthStatus,
  type YoutubePrivacyStatus,
} from '../api/youtube-oauth';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type ExportYoutubePlaylistModalProps = {
  playlistId: string;
  playlistTitle: string;
  trackCount: number;
  onClose: () => void;
  onExported: (url: string) => void;
  oauthJustConnected?: boolean;
};

export default function ExportYoutubePlaylistModal({
  playlistId,
  playlistTitle,
  trackCount,
  onClose,
  onExported,
  oauthJustConnected = false,
}: ExportYoutubePlaylistModalProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<YoutubeOAuthStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState<YoutubePrivacyStatus>('unlisted');
  const [error, setError] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<{ added: number; failed: number } | null>(null);

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

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, oauthJustConnected]);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const { url } = await startYoutubeOAuth(playlistId);
      window.location.href = url;
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_oauth_start_failed', t));
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectYoutubeOAuth();
      await loadStatus();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_oauth_disconnect_failed', t));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const result = await exportPlaylistToYoutube(playlistId, {
        privacyStatus,
        title: playlistTitle,
      });
      setExportUrl(result.youtubePlaylistUrl);
      setExportSummary({ added: result.itemsAdded, failed: result.itemsFailed });
      onExported(result.youtubePlaylistUrl);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_export_failed', t));
    } finally {
      setExporting(false);
    }
  };

  const connected = status?.connected ?? false;
  const configured = status?.configured ?? true;

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal export-youtube-modal">
        <div className="metadata-modal-header">
          <h3>{t('playlists.exportYoutubeTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('metadata.close')}
          >
            ×
          </button>
        </div>

        <div className="metadata-modal-body">
          <p className="export-youtube-intro">
            {t('playlists.exportYoutubeIntro', { title: playlistTitle })}
          </p>
          {trackCount > 0 && (
            <p className="export-youtube-track-count">
              {t('playlists.exportYoutubeTrackCount', { count: trackCount })}
            </p>
          )}
          {trackCount > 10 && (
            <p className="export-youtube-hint">{t('playlists.exportYoutubeSlowHint')}</p>
          )}

          {oauthJustConnected && connected && !exportUrl && (
            <>
              <p className="export-youtube-notice">{t('playlists.exportYoutubeConnected')}</p>
              <p className="export-youtube-notice export-youtube-next-step">
                {t('playlists.exportYoutubeNextStep')}
              </p>
            </>
          )}

          {loadingStatus ? (
            <p className="export-youtube-loading">{t('playlists.exportYoutubeLoading')}</p>
          ) : !configured ? (
            <p className="export-youtube-notice">{t('playlists.exportYoutubeNotConfigured')}</p>
          ) : (
            <>
              {connected ? (
                <div className="export-youtube-account">
                  <p>{t('playlists.exportYoutubeAccount')}</p>
                  <p className="export-youtube-channel">
                    {status?.channelTitle || status?.googleAccountEmail || t('playlists.exportYoutubeUnknownAccount')}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary btn-danger-outline"
                    onClick={() => void handleDisconnect()}
                    disabled={disconnecting || exporting}
                  >
                    {disconnecting ? t('playlists.exportYoutubeDisconnecting') : t('playlists.exportYoutubeDisconnect')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleConnect()}
                  disabled={connecting}
                >
                  {connecting ? t('playlists.exportYoutubeConnecting') : t('playlists.exportYoutubeConnect')}
                </button>
              )}

              {connected && !exportUrl && (
                <form className="export-youtube-form" onSubmit={(e) => void handleExport(e)}>
                  <label className="export-youtube-field">
                    <span>{t('playlists.exportYoutubePrivacyLabel')}</span>
                    <select
                      className="playlists-text-input"
                      value={privacyStatus}
                      onChange={(e) => setPrivacyStatus(e.target.value as YoutubePrivacyStatus)}
                      disabled={exporting}
                    >
                      <option value="unlisted">{t('playlists.exportYoutubePrivacyUnlisted')}</option>
                      <option value="private">{t('playlists.exportYoutubePrivacyPrivate')}</option>
                      <option value="public">{t('playlists.exportYoutubePrivacyPublic')}</option>
                    </select>
                  </label>
                  <button type="submit" className="btn-primary" disabled={exporting}>
                    {exporting ? t('playlists.exportYoutubeExporting') : t('playlists.exportYoutubeExport')}
                  </button>
                </form>
              )}

              {exportUrl && (
                <div className="export-youtube-result">
                  <p>
                    {exportSummary && exportSummary.failed > 0
                      ? t('playlists.exportYoutubeSuccessPartial', {
                          added: exportSummary.added,
                          failed: exportSummary.failed,
                        })
                      : t('playlists.exportYoutubeSuccessCount', {
                          count: exportSummary?.added ?? trackCount,
                        })}
                  </p>
                  <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="export-youtube-link">
                    {t('playlists.exportYoutubeOpenLink')}
                  </a>
                  <p className="export-youtube-hint">{t('playlists.exportYoutubeVisibilityHint')}</p>
                </div>
              )}
            </>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
