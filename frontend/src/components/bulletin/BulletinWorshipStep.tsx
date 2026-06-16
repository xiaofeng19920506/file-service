import { useCallback, useEffect, useState } from 'react';
import {
  ensureBulletinWorshipPlaylist,
  inviteBulletinWorshipLeader,
  type WeeklyBulletin,
} from '../../api/bulletins';
import { getPlaylist, type PlaylistDetail } from '../../api/playlists';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';

type BulletinWorshipStepProps = {
  draft: WeeklyBulletin;
  canEdit: boolean;
  onPlaylistReady: (playlistId: string) => void;
};

export default function BulletinWorshipStep({
  draft,
  canEdit,
  onPlaylistReady,
}: BulletinWorshipStepProps) {
  const { t } = useI18n();
  const [playlistDetail, setPlaylistDetail] = useState<PlaylistDetail | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPlaylist = useCallback(async (playlistId: string) => {
    const detail = await getPlaylist(playlistId);
    setPlaylistDetail(detail);
  }, []);

  useEffect(() => {
    if (!draft.servicePlaylistId) return;
    void loadPlaylist(draft.servicePlaylistId).catch(() => undefined);
  }, [draft.servicePlaylistId, loadPlaylist]);

  const ensurePlaylist = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await ensureBulletinWorshipPlaylist(draft.id);
      onPlaylistReady(result.playlist.id);
      setInviteUrl(result.inviteUrl);
      await loadPlaylist(result.playlist.id);
      setStatus(t('bulletin.worshipPlaylistReady'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'create_playlist_failed', t));
    } finally {
      setBusy(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteUrl) {
      await ensurePlaylist();
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setStatus(t('bulletin.worshipInviteCopied'));
    } catch {
      setError(t('bulletin.worshipInviteCopyFailed'));
    }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await inviteBulletinWorshipLeader(draft.id, {
        email: email.trim(),
        message: message.trim() || undefined,
      });
      onPlaylistReady(result.playlist.id);
      setInviteUrl(result.inviteUrl);
      await loadPlaylist(result.playlist.id);
      setStatus(t('bulletin.worshipInviteSent'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'email_send_failed', t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulletin-wizard-step">
      <header className="bulletin-step-header">
        <h3>{t('bulletin.steps.worshipTitle')}</h3>
        <p className="bulletin-step-intro">{t('bulletin.steps.worshipIntro')}</p>
      </header>

      <div className="bulletin-cover-step-fields">
        <p className="bulletin-worship-meta">
          {t('bulletin.worshipServiceLabel', { date: draft.serviceDate, time: draft.serviceTime })}
        </p>

        {playlistDetail ? (
          <p className="bulletin-worship-meta">
            {t('bulletin.worshipTrackCount', { count: playlistDetail.items.length })}
          </p>
        ) : (
          <p className="playlists-muted">{t('bulletin.worshipNoPlaylist')}</p>
        )}

        {canEdit && (
          <div className="bulletin-worship-actions">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void ensurePlaylist()}>
              {busy ? t('bulletin.worshipPreparing') : t('bulletin.worshipPreparePlaylist')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => void copyInviteLink()}
            >
              {t('bulletin.worshipCopyInvite')}
            </button>
          </div>
        )}

        {canEdit && (
          <form className="bulletin-worship-invite-form" onSubmit={(e) => void sendInvite(e)}>
            <label className="bulletin-field">
              {t('bulletin.worshipInviteEmail')}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('bulletin.worshipInviteEmailPlaceholder')}
                disabled={busy}
              />
            </label>
            <label className="bulletin-field">
              {t('bulletin.worshipInviteMessage')}
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={busy}
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={busy || !email.trim()}>
              {t('bulletin.worshipSendInvite')}
            </button>
          </form>
        )}

        {inviteUrl && canEdit && (
          <label className="bulletin-field">
            {t('bulletin.worshipInviteLink')}
            <input type="text" readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
          </label>
        )}

        {status && <p className="success-msg">{status}</p>}
        {error && <p className="error-msg">{error}</p>}
      </div>
    </div>
  );
}
