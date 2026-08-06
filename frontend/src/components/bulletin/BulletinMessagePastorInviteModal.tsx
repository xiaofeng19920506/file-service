import { useEffect, useRef, useState } from 'react';
import { inviteBulletinSectionPastor } from '../../api/bulletins';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';

type BulletinMessagePastorInviteModalProps = {
  bulletinId: string;
  onClose: () => void;
  onInvited: (result: { inviteUrl: string; email: string }) => void;
};

export default function BulletinMessagePastorInviteModal({
  bulletinId,
  onClose,
  onInvited,
}: BulletinMessagePastorInviteModalProps) {
  const { t } = useI18n();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError(friendlyError('invalid_email', t));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await inviteBulletinSectionPastor(bulletinId, 'message', {
        email: trimmed,
        message: message.trim() || undefined,
      });
      onInvited({ inviteUrl: result.inviteUrl, email: result.email });
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'email_send_failed', t));
      setSending(false);
    }
  };

  return (
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulletin-pastor-invite-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="metadata-modal bulletin-worship-invite-modal">
        <div className="metadata-modal-header">
          <h3 id="bulletin-pastor-invite-title">{t('bulletin.pastorInviteTitle')}</h3>
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
          <p className="share-playlist-intro">{t('bulletin.pastorInviteHint')}</p>

          <label className="share-playlist-field">
            <span>{t('bulletin.pastorInviteEmail')}</span>
            <input
              ref={emailRef}
              type="email"
              className="playlists-text-input"
              value={email}
              disabled={sending}
              placeholder={t('bulletin.pastorInviteEmailPlaceholder')}
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="share-playlist-field">
            <span>{t('bulletin.pastorInviteMessage')}</span>
            <textarea
              className="playlists-text-input"
              value={message}
              disabled={sending}
              rows={3}
              placeholder={t('bulletin.pastorInviteMessagePlaceholder')}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="metadata-modal-actions">
            <button type="button" className="btn-secondary" disabled={sending} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={sending || !email.trim()}>
              {sending ? t('bulletin.pastorInviteSending') : t('bulletin.pastorInviteSend')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
