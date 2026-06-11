import { useState } from 'react';
import { sharePlaylist } from '../api/playlists';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type SharePlaylistModalProps = {
  playlistId: string;
  playlistTitle: string;
  onClose: () => void;
  onSent: () => void;
};

export default function SharePlaylistModal({
  playlistId,
  playlistTitle,
  onClose,
  onSent,
}: SharePlaylistModalProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || sending) return;

    setSending(true);
    setError(null);
    try {
      await sharePlaylist(playlistId, {
        email: trimmedEmail,
        message: message.trim() || undefined,
      });
      onSent();
      onClose();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'share_playlist_failed', t));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal share-playlist-modal">
        <div className="metadata-modal-header">
          <h3>{t('playlists.shareTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('metadata.close')}
          >
            ×
          </button>
        </div>
        <form className="metadata-modal-body" onSubmit={(e) => void handleSubmit(e)}>
          <p className="share-playlist-intro">
            {t('playlists.shareIntro', { title: playlistTitle })}
          </p>
          <label className="share-playlist-field">
            <span>{t('playlists.shareEmailLabel')}</span>
            <input
              type="email"
              className="playlists-text-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              autoComplete="email"
              required
              disabled={sending}
            />
          </label>
          <label className="share-playlist-field">
            <span>{t('playlists.shareMessageLabel')}</span>
            <textarea
              className="playlists-text-input share-playlist-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('playlists.shareMessagePlaceholder')}
              rows={3}
              disabled={sending}
            />
          </label>
          {error && <p className="error-msg">{error}</p>}
          <div className="metadata-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={sending || !email.trim()}>
              {sending ? t('playlists.shareSending') : t('playlists.shareSend')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
