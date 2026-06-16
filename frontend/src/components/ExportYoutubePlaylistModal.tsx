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
import { getCachedUser } from '../lib/auth-session';
import { isValidEmail, openGmailCompose, openMailtoShare } from '../lib/mailto-share';
import { formatUserDisplayName } from '../lib/user-name';
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
  const [exportSummary, setExportSummary] = useState<{
    added: number;
    failed: number;
    failedVideoIds: string[];
  } | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [shareEmailError, setShareEmailError] = useState<string | null>(null);

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
      const { url } = await startYoutubeOAuth({ returnPlaylistId: playlistId });
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
      setExportSummary({
        added: result.itemsAdded,
        failed: result.itemsFailed,
        failedVideoIds: result.failedVideoIds ?? [],
      });
      onExported(result.youtubePlaylistUrl);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_export_failed', t));
    } finally {
      setExporting(false);
    }
  };

  const buildShareMail = () => {
    const user = getCachedUser();
    const senderName = user ? formatUserDisplayName(user) : t('playlists.exportYoutubeUnknownAccount');
    const trackTotal = exportSummary?.added ?? trackCount;
    const subject = t('playlists.exportYoutubeMailSubject', {
      title: playlistTitle,
      sender: senderName,
    });
    const bodyLines = [
      t('playlists.exportYoutubeMailBodyIntro', {
        sender: senderName,
        title: playlistTitle,
        count: trackTotal,
      }),
      shareMessage.trim() ? `\n${shareMessage.trim()}\n` : '',
      exportUrl ? t('playlists.exportYoutubeMailBodyLink', { url: exportUrl }) : '',
    ].filter((line) => line !== '');
    return { subject, body: bodyLines.join('\n') };
  };

  const shareRecipient = () => {
    const to = shareEmail.trim();
    if (!to) return undefined;
    if (!isValidEmail(to)) {
      setShareEmailError(t('errors.invalid_email'));
      return null;
    }
    setShareEmailError(null);
    return to;
  };

  const handleShareMyPlaylist = () => {
    if (!exportUrl) return;
    const to = shareRecipient();
    if (to === null) return;
    const { subject, body } = buildShareMail();
    openMailtoShare({ to, subject, body });
  };

  const handleShareInGmail = () => {
    if (!exportUrl) return;
    const to = shareRecipient();
    if (to === null) return;
    const { subject, body } = buildShareMail();
    openGmailCompose({ to, subject, body });
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
                  {status?.dataApiReady === false && status.dataApiError && (
                    <p className="form-error export-youtube-api-warning">
                      {friendlyError(status.dataApiError, t)}
                    </p>
                  )}
                  {status?.dataApiReady === false && (
                    <p className="export-youtube-hint">{t('playlists.exportYoutubeApiEnableHint')}</p>
                  )}
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
                  <button type="submit" className="btn-primary" disabled={exporting || status?.dataApiReady === false}>
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
                  {exportSummary && exportSummary.failedVideoIds.length > 0 && (
                    <p className="export-youtube-failed-ids">
                      {t('playlists.exportYoutubeFailedIds', {
                        ids: exportSummary.failedVideoIds.slice(0, 5).join(', '),
                      })}
                    </p>
                  )}

                  <div className="export-youtube-share">
                    <button
                      type="button"
                      className="btn-primary export-youtube-share-btn"
                      onClick={handleShareMyPlaylist}
                    >
                      {t('playlists.exportYoutubeShareMyPlaylist')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleShareInGmail}
                    >
                      {t('playlists.exportYoutubeShareInGmail')}
                    </button>
                    <p className="export-youtube-hint">{t('playlists.exportYoutubeShareHint')}</p>

                    <details className="export-youtube-share-options">
                      <summary>{t('playlists.exportYoutubeShareOptions')}</summary>
                      <label className="share-playlist-field">
                        <span>{t('playlists.shareEmailLabel')}</span>
                        <input
                          type="email"
                          className="playlists-text-input"
                          value={shareEmail}
                          onChange={(e) => {
                            setShareEmail(e.target.value);
                            setShareEmailError(null);
                          }}
                          placeholder={t('playlists.exportYoutubeShareEmailOptional')}
                          autoComplete="email"
                        />
                      </label>
                      <label className="share-playlist-field">
                        <span>{t('playlists.shareMessageLabel')}</span>
                        <textarea
                          className="playlists-text-input share-playlist-message"
                          value={shareMessage}
                          onChange={(e) => setShareMessage(e.target.value)}
                          placeholder={t('playlists.shareMessagePlaceholder')}
                          rows={3}
                        />
                      </label>
                      {shareEmailError && <p className="form-error">{shareEmailError}</p>}
                    </details>
                  </div>
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
