import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ensureBulletinWorshipPlaylist,
  getBulletinWorshipPlaylist,
  inviteBulletinWorshipLeader,
  removeBulletinWorshipPlaylistItem,
  reorderBulletinWorshipPlaylistItems,
  updateBulletin,
  type WeeklyBulletin,
} from '../../api/bulletins';
import { uploadFile } from '../../api/client';
import type { PlaylistDetail, PlaylistItem } from '../../api/playlists';
import AddPlaylistItemsModal from '../AddPlaylistItemsModal';
import MobileSegmentedControl from '../MobileSegmentedControl';
import BulletinWorshipYoutubeImportPanel from './BulletinWorshipYoutubeImportPanel';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';
import { SectionVisibleCheckbox } from './BulletinWizardSteps';

type WorshipSourceTab = 'youtube' | 'search';

type BulletinWorshipStepProps = {
  draft: WeeklyBulletin;
  canManage: boolean;
  canEditSongs: boolean;
  oauthJustConnected?: boolean;
  oauthError?: string | null;
  onClearOauthError?: () => void;
  onPlaylistReady: (playlistId: string) => void;
  onPlaylistChanged?: () => void;
  onLyricsPptxChange?: (blobId: string | null) => void;
  onSectionVisibilityChange?: (sectionId: string, visible: boolean) => void;
  onSaveVisibility?: () => void;
  saving?: boolean;
};

function reorderToFinalIndex<T>(items: T[], from: number, toIndex: number): T[] {
  if (from === toIndex || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

export default function BulletinWorshipStep({
  draft,
  canManage,
  canEditSongs,
  oauthJustConnected = false,
  oauthError = null,
  onClearOauthError,
  onPlaylistReady,
  onPlaylistChanged,
  onLyricsPptxChange,
  onSectionVisibilityChange,
  onSaveVisibility,
  saving,
}: BulletinWorshipStepProps) {
  const { t } = useI18n();
  const lyricsFileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lyricsUploading, setLyricsUploading] = useState(false);
  const [sourceTab, setSourceTab] = useState<WorshipSourceTab>(
    oauthJustConnected || oauthError ? 'youtube' : 'youtube',
  );
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const canAddSongs = canEditSongs || canManage;
  const hasLyricsPptx = Boolean(draft.worshipLyricsPptxBlobId);

  const existingVideoIds = useMemo(
    () => new Set(items.map((item) => item.youtubeVideoId)),
    [items],
  );

  const refreshPlaylist = useCallback(async () => {
    const data = await getBulletinWorshipPlaylist(draft.id);
    if (data.playlist) {
      setItems(data.items);
      if (draft.servicePlaylistId !== data.playlist.id) {
        onPlaylistReady(data.playlist.id);
      }
    } else {
      setItems([]);
    }
  }, [draft.id, draft.servicePlaylistId, onPlaylistReady]);

  useEffect(() => {
    void refreshPlaylist().catch(() => undefined);
  }, [refreshPlaylist, draft.servicePlaylistId]);

  useEffect(() => {
    if (oauthJustConnected || oauthError) setSourceTab('youtube');
  }, [oauthJustConnected, oauthError]);

  const handleSourceTabChange = (id: string) => {
    const next = id as WorshipSourceTab;
    setSourceTab(next);
    if (next === 'search' && canAddSongs) {
      setSearchModalOpen(true);
    }
  };

  const handleImported = (
    detail: PlaylistDetail,
    meta: { addedCount: number; skippedCount: number },
  ) => {
    setItems(detail.items);
    onPlaylistReady(detail.playlist.id);
    if (meta.addedCount > 0) {
      setStatus(t('bulletin.worshipImportedCount', { count: meta.addedCount }));
    } else if (meta.skippedCount > 0) {
      setStatus(t('worshipSongs.duplicateSkipped'));
    }
    void refreshPlaylist();
    onPlaylistChanged?.();
  };

  const handleSearchAdded = (
    detail: PlaylistDetail,
    meta: { addedCount: number; skippedCount: number },
  ) => {
    handleImported(detail, meta);
  };

  const handleRemove = async (item: PlaylistItem) => {
    if (!canAddSongs) return;
    setError(null);
    try {
      await removeBulletinWorshipPlaylistItem(draft.id, item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      onPlaylistChanged?.();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'remove_playlist_item_failed', t));
    }
  };

  const handleDrop = async (toIndex: number) => {
    if (!canAddSongs || dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      return;
    }
    const reordered = reorderToFinalIndex(items, dragIndex, toIndex);
    setDragIndex(null);
    setItems(reordered);
    try {
      const data = await reorderBulletinWorshipPlaylistItems(
        draft.id,
        reordered.map((item) => item.id),
      );
      setItems(data.items);
      onPlaylistChanged?.();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'reorder_playlist_failed', t));
      await refreshPlaylist();
    }
  };

  const copyInviteLink = async () => {
    setBusy(true);
    setError(null);
    try {
      let url = inviteUrl;
      if (!url) {
        const result = await ensureBulletinWorshipPlaylist(draft.id);
        onPlaylistReady(result.playlist.id);
        url = result.inviteUrl;
        setInviteUrl(url);
      }
      await navigator.clipboard.writeText(url);
      setStatus(t('bulletin.worshipInviteCopied'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'create_playlist_failed', t));
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await inviteBulletinWorshipLeader(draft.id, { email: email.trim() });
      onPlaylistReady(result.playlist.id);
      setInviteUrl(result.inviteUrl);
      setStatus(t('bulletin.worshipInviteSent'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'email_send_failed', t));
    } finally {
      setBusy(false);
    }
  };

  const handleLyricsPptxSelected = async (file: File | null) => {
    if (!file || !canManage) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pptx') && !name.endsWith('.ppt')) {
      setError(t('bulletin.worshipLyricsPptxInvalid'));
      return;
    }
    setLyricsUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, {
        title: `${draft.serviceDate} 敬拜歌词`,
        titleZhCn: `${draft.serviceDate} 敬拜歌词`,
        notes: `bulletin:${draft.id}:worship-lyrics`,
      });
      const updated = await updateBulletin(draft.id, {
        worshipLyricsPptxBlobId: uploaded.blobId,
      });
      onLyricsPptxChange?.(updated.worshipLyricsPptxBlobId);
      setStatus(t('bulletin.worshipLyricsPptxUploaded'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'upload_failed', t));
    } finally {
      setLyricsUploading(false);
      if (lyricsFileInputRef.current) lyricsFileInputRef.current.value = '';
    }
  };

  const clearLyricsPptx = async () => {
    if (!canManage || !draft.worshipLyricsPptxBlobId) return;
    setLyricsUploading(true);
    setError(null);
    try {
      await updateBulletin(draft.id, { worshipLyricsPptxBlobId: null });
      onLyricsPptxChange?.(null);
      setStatus(t('bulletin.worshipLyricsPptxCleared'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
    } finally {
      setLyricsUploading(false);
    }
  };

  return (
    <div className="bulletin-wizard-step bulletin-worship-step">
      <header className="bulletin-step-header">
        <h3>{t('bulletin.steps.worshipTitle')}</h3>
        <p className="bulletin-step-intro">{t('bulletin.steps.worshipIntro')}</p>
      </header>

      {onSectionVisibilityChange ? (
        <div className="bulletin-cover-step-fields" style={{ marginBottom: '0.75rem' }}>
          <SectionVisibleCheckbox
            sectionId="worship"
            draft={draft}
            canEdit={canManage}
            onSectionVisibilityChange={onSectionVisibilityChange}
          />
          {canManage && onSaveVisibility ? (
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={onSaveVisibility}
            >
              {saving ? t('bulletin.saving') : t('bulletin.save')}
            </button>
          ) : null}
        </div>
      ) : null}

      {(canManage || hasLyricsPptx) && (
        <section className="bulletin-worship-lyrics-pptx">
          <h4 className="bulletin-worship-playlist-heading">{t('bulletin.worshipLyricsPptxTitle')}</h4>
          <p className="bulletin-worship-search-hint">{t('bulletin.worshipLyricsPptxHint')}</p>
          <div className="bulletin-worship-lyrics-pptx-actions">
            {canManage ? (
              <>
                <input
                  ref={lyricsFileInputRef}
                  type="file"
                  accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                  hidden
                  onChange={(e) => void handleLyricsPptxSelected(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={lyricsUploading}
                  onClick={() => lyricsFileInputRef.current?.click()}
                >
                  {lyricsUploading
                    ? t('bulletin.worshipLyricsPptxUploading')
                    : hasLyricsPptx
                      ? t('bulletin.worshipLyricsPptxReplace')
                      : t('bulletin.worshipLyricsPptxUpload')}
                </button>
                {hasLyricsPptx ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={lyricsUploading}
                    onClick={() => void clearLyricsPptx()}
                  >
                    {t('bulletin.worshipLyricsPptxClear')}
                  </button>
                ) : null}
              </>
            ) : null}
            {hasLyricsPptx ? (
              <span className="bulletin-worship-lyrics-pptx-ready">
                {t('bulletin.worshipLyricsPptxReady')}
              </span>
            ) : (
              <span className="playlists-muted">{t('bulletin.worshipLyricsPptxEmpty')}</span>
            )}
          </div>
        </section>
      )}

      {canAddSongs && (
        <>
          <MobileSegmentedControl
            className="bulletin-worship-tabs"
            ariaLabel={t('bulletin.worshipSourceTabs')}
            value={sourceTab}
            onChange={handleSourceTabChange}
            segments={[
              { id: 'youtube', label: t('bulletin.worshipTabYoutube') },
              { id: 'search', label: t('bulletin.worshipTabSearch') },
            ]}
          />

          <div className="bulletin-worship-tab-panel" role="tabpanel">
            {sourceTab === 'youtube' ? (
              <BulletinWorshipYoutubeImportPanel
                bulletinId={draft.id}
                oauthJustConnected={oauthJustConnected}
                oauthError={oauthError}
                onClearOauthError={onClearOauthError}
                onImported={handleImported}
              />
            ) : (
              <div className="bulletin-worship-search-panel">
                <p className="bulletin-worship-search-hint">{t('bulletin.worshipSearchModalHint')}</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setSearchModalOpen(true)}
                >
                  {t('bulletin.worshipOpenSearchModal')}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <section className="bulletin-worship-playlist-preview">
        <div className="bulletin-worship-playlist-heading-row">
          <h4 className="bulletin-worship-playlist-heading">
            {items.length > 0
              ? t('bulletin.worshipTrackCount', { count: items.length })
              : t('bulletin.worshipNoPlaylist')}
          </h4>
          {canAddSongs ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setSourceTab('search');
                setSearchModalOpen(true);
              }}
            >
              {t('bulletin.worshipOpenSearchModal')}
            </button>
          ) : null}
        </div>
        {items.length > 0 ? (
          <ol className="bulletin-worship-track-preview">
            {items.map((item, index) => (
              <li
                key={item.id}
                className={
                  canAddSongs
                    ? `bulletin-worship-track-preview-item${dragIndex === index ? ' is-dragging' : ''}`
                    : undefined
                }
                draggable={canAddSongs}
                onDragStart={canAddSongs ? () => setDragIndex(index) : undefined}
                onDragOver={
                  canAddSongs
                    ? (e) => {
                        e.preventDefault();
                      }
                    : undefined
                }
                onDrop={canAddSongs ? () => void handleDrop(index) : undefined}
              >
                <span className="bulletin-worship-track-preview-order">{index + 1}</span>
                <span className="bulletin-worship-track-preview-title">{item.title}</span>
                {canAddSongs ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => void handleRemove(item)}
                  >
                    {t('playlists.removeTrackShort')}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="playlists-muted">{t('bulletin.worshipEmptyHint')}</p>
        )}
        {canAddSongs && items.length > 0 ? (
          <p className="bulletin-worship-reorder-hint">{t('bulletin.worshipReorderHint')}</p>
        ) : null}
      </section>

      {canManage && (
        <details className="bulletin-worship-invite-details">
          <summary>{t('bulletin.worshipShowInvite')}</summary>
          <div className="bulletin-worship-invite-section">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void copyInviteLink()}
            >
              {t('bulletin.worshipCopyInvite')}
            </button>
            <form className="bulletin-worship-invite-form" onSubmit={(e) => void sendInvite(e)}>
              <input
                type="email"
                className="playlists-text-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('bulletin.worshipInviteEmailPlaceholder')}
                disabled={busy}
              />
              <button type="submit" className="btn-secondary btn-sm" disabled={busy || !email.trim()}>
                {t('bulletin.worshipSendInvite')}
              </button>
            </form>
          </div>
        </details>
      )}

      {status && <p className="success-msg">{status}</p>}
      {error && <p className="error-msg">{error}</p>}

      {searchModalOpen && canAddSongs ? (
        <AddPlaylistItemsModal
          bulletinId={draft.id}
          existingVideoIds={existingVideoIds}
          onClose={() => setSearchModalOpen(false)}
          onAdded={handleSearchAdded}
        />
      ) : null}
    </div>
  );
}
