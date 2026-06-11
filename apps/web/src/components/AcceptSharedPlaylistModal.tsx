import { useEffect, useState } from 'react';
import {
  acceptSharedPlaylist,
  getSharedPlaylist,
  type PlaylistDetail,
} from '../api/playlists';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type AcceptSharedPlaylistModalProps = {
  shareToken: string;
  onClose: () => void;
  onAccepted: (detail: PlaylistDetail) => void;
};

export default function AcceptSharedPlaylistModal({
  shareToken,
  onClose,
  onAccepted,
}: AcceptSharedPlaylistModalProps) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getSharedPlaylist(shareToken);
        if (cancelled) return;
        setDetail(data);
        setIsOwner(data.isOwner ?? false);
      } catch (err) {
        if (!cancelled) {
          setError(
            friendlyError(err instanceof Error ? err.message : 'invalid_share_token', t),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareToken, t]);

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    setError(null);
    try {
      const data = await acceptSharedPlaylist(shareToken);
      onAccepted(data);
      onClose();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'accept_share_failed', t));
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal accept-share-modal">
        <div className="metadata-modal-header">
          <h3>{t('playlists.shareReceivedTitle')}</h3>
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
          {loading ? (
            <p className="playlists-muted">{t('playlists.shareLoading')}</p>
          ) : detail ? (
            <>
              <p className="accept-share-playlist-title">{detail.playlist.title}</p>
              <p className="playlists-muted">
                {t('playlists.trackCount', { count: detail.playlist.itemCount })}
                {detail.playlist.matchedCount > 0 && (
                  <>
                    {' · '}
                    {t('playlists.matchStats', {
                      matched: detail.playlist.matchedCount,
                      total: detail.playlist.itemCount,
                    })}
                  </>
                )}
              </p>
              {isOwner ? (
                <p className="playlists-muted">{t('playlists.shareOwnPlaylist')}</p>
              ) : (
                <p className="playlists-muted">{t('playlists.shareAcceptHint')}</p>
              )}
            </>
          ) : (
            <p className="error-msg">{error ?? t('errors.invalid_share_token')}</p>
          )}
          {error && detail && <p className="error-msg">{error}</p>}
        </div>
        <div className="metadata-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          {detail && (
            <button
              type="button"
              className="btn-primary"
              disabled={accepting}
              onClick={() => void handleAccept()}
            >
              {accepting
                ? t('playlists.shareAccepting')
                : isOwner
                  ? t('playlists.shareOpenExisting')
                  : t('playlists.shareAccept')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
