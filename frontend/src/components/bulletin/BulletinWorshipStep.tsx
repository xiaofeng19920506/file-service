import { useCallback, useEffect, useState } from 'react';
import {
  ensureBulletinWorshipPlaylist,
  getBulletinWorshipPlaylist,
  inviteBulletinWorshipLeader,
  type WeeklyBulletin,
} from '../../api/bulletins';
import type { PlaylistDetail, PlaylistItem } from '../../api/playlists';
import ImportYoutubePlaylistModal from './ImportYoutubePlaylistModal';
import ManualLinksPlaylistModal from './ManualLinksPlaylistModal';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';

type BulletinWorshipStepProps = {
  draft: WeeklyBulletin;
  canManage: boolean;
  canEditSongs: boolean;
  oauthJustConnected?: boolean;
  onPlaylistReady: (playlistId: string) => void;
};

export default function BulletinWorshipStep({
  draft,
  canManage,
  canEditSongs,
  oauthJustConnected = false,
  onPlaylistReady,
}: BulletinWorshipStepProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(oauthJustConnected);
  const [manualModalOpen, setManualModalOpen] = useState(false);

  const refreshPlaylist = useCallback(async () => {
    const data = await getBulletinWorshipPlaylist(draft.id);
    if (data.playlist) {
      setItems(data.items);
      setPlaylistTitle(data.playlist.title);
      if (draft.servicePlaylistId !== data.playlist.id) {
        onPlaylistReady(data.playlist.id);
      }
    } else {
      setItems([]);
      setPlaylistTitle('');
    }
  }, [draft.id, draft.servicePlaylistId, onPlaylistReady]);

  useEffect(() => {
    void refreshPlaylist().catch(() => undefined);
  }, [refreshPlaylist, draft.servicePlaylistId]);

  useEffect(() => {
    if (oauthJustConnected) {
      setYoutubeModalOpen(true);
    }
  }, [oauthJustConnected]);

  const handleImported = (
    detail: PlaylistDetail,
    meta: { addedCount: number; skippedCount: number },
  ) => {
    setItems(detail.items);
    setPlaylistTitle(detail.playlist.title);
    onPlaylistReady(detail.playlist.id);
    if (meta.addedCount > 0) {
      setStatus(t('bulletin.worshipImportedCount', { count: meta.addedCount }));
    } else if (meta.skippedCount > 0) {
      setStatus(t('worshipSongs.duplicateSkipped'));
    }
    void refreshPlaylist();
  };

  const ensurePlaylist = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await ensureBulletinWorshipPlaylist(draft.id);
      onPlaylistReady(result.playlist.id);
      setInviteUrl(result.inviteUrl);
      await refreshPlaylist();
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
    try {
      const result = await inviteBulletinWorshipLeader(draft.id, {
        email: email.trim(),
      });
      onPlaylistReady(result.playlist.id);
      setInviteUrl(result.inviteUrl);
      setStatus(t('bulletin.worshipInviteSent'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'email_send_failed', t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulletin-wizard-step bulletin-worship-step">
      <div className="bulletin-worship-layout">
        <aside className="bulletin-worship-intro-panel">
          <h3>{t('bulletin.steps.worshipTitle')}</h3>
          <p>{t('bulletin.worshipPanelIntro')}</p>
          <ul className="bulletin-worship-intro-list">
            <li>{t('bulletin.worshipPanelHintYoutube')}</li>
            <li>{t('bulletin.worshipPanelHintLinks')}</li>
            <li>{t('bulletin.worshipPanelHintPpt')}</li>
          </ul>
          <p className="bulletin-worship-meta">
            {t('bulletin.worshipServiceLabel', { date: draft.serviceDate, time: draft.serviceTime })}
          </p>
          {canManage && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setShowInvite((open) => !open)}
            >
              {showInvite ? t('bulletin.worshipHideInvite') : t('bulletin.worshipShowInvite')}
            </button>
          )}
        </aside>

        <div className="bulletin-worship-main-panel">
          {canEditSongs && (
            <div className="bulletin-worship-action-buttons">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setYoutubeModalOpen(true)}
              >
                {t('bulletin.worshipImportYoutubeBtn')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setManualModalOpen(true)}
              >
                {t('bulletin.worshipManualLinksBtn')}
              </button>
            </div>
          )}

          <section className="bulletin-worship-playlist-preview">
            <h4>
              {items.length > 0
                ? t('bulletin.worshipTrackCount', { count: items.length })
                : t('bulletin.worshipNoPlaylist')}
            </h4>
            {playlistTitle && (
              <p className="playlists-muted bulletin-worship-playlist-name">{playlistTitle}</p>
            )}
            {items.length > 0 ? (
              <ol className="bulletin-worship-track-preview">
                {items.map((item, index) => (
                  <li key={item.id}>
                    <span className="bulletin-worship-track-preview-order">{index + 1}</span>
                    <span className="bulletin-worship-track-preview-title">{item.title}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="playlists-muted">{t('bulletin.worshipEmptyHint')}</p>
            )}
          </section>

          {showInvite && canManage && (
            <section className="bulletin-worship-invite-section">
              <div className="bulletin-worship-actions">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void copyInviteLink()}
                >
                  {t('bulletin.worshipCopyInvite')}
                </button>
              </div>
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
                <button type="submit" className="btn-secondary btn-sm" disabled={busy || !email.trim()}>
                  {t('bulletin.worshipSendInvite')}
                </button>
              </form>
              {inviteUrl && (
                <input type="text" readOnly className="playlists-text-input" value={inviteUrl} />
              )}
            </section>
          )}

          {status && <p className="success-msg">{status}</p>}
          {error && <p className="error-msg">{error}</p>}
        </div>
      </div>

      {youtubeModalOpen && canEditSongs && (
        <ImportYoutubePlaylistModal
          bulletinId={draft.id}
          oauthJustConnected={oauthJustConnected}
          onClose={() => setYoutubeModalOpen(false)}
          onImported={handleImported}
        />
      )}

      {manualModalOpen && canEditSongs && (
        <ManualLinksPlaylistModal
          bulletinId={draft.id}
          onClose={() => setManualModalOpen(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}
