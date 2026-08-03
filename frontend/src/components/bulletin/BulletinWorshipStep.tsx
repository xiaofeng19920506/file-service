import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ensureBulletinWorshipPlaylist,
  getBulletinWorshipPlaylist,
  removeBulletinWorshipPlaylistItem,
  reorderBulletinWorshipPlaylistItems,
  updateBulletin,
  type WeeklyBulletin,
} from '../../api/bulletins';
import { uploadFile } from '../../api/client';
import type { PlaylistDetail, PlaylistItem } from '../../api/playlists';
import AddPlaylistItemsModal from '../AddPlaylistItemsModal';
import BulletinWorshipYoutubeImportPanel from './BulletinWorshipYoutubeImportPanel';
import BulletinWorshipInviteModal from './BulletinWorshipInviteModal';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';

type BulletinWorshipStepProps = {
  draft: WeeklyBulletin;
  canManage: boolean;
  canEditSongs: boolean;
  oauthJustConnected?: boolean;
  oauthError?: string | null;
  onClearOauthError?: () => void;
  /** SSE / 预览刷新：远端歌单变更时递增，触发重新拉取 */
  playlistRefreshKey?: number;
  onPlaylistReady: (playlistId: string) => void;
  onPlaylistChanged?: () => void;
  onLyricsPptxChange?: (blobId: string | null) => void;
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
  playlistRefreshKey = 0,
  onPlaylistReady,
  onPlaylistChanged,
  onLyricsPptxChange,
}: BulletinWorshipStepProps) {
  const { t } = useI18n();
  const lyricsFileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lyricsUploading, setLyricsUploading] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(
    Boolean(oauthJustConnected || oauthError),
  );
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
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
  }, [refreshPlaylist, draft.servicePlaylistId, playlistRefreshKey]);

  useEffect(() => {
    if (oauthJustConnected || oauthError) setYoutubeModalOpen(true);
  }, [oauthJustConnected, oauthError]);

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
      <section className="bulletin-worship-playlist-preview">
        <div className="bulletin-worship-playlist-heading-row">
          <h4 className="bulletin-worship-playlist-heading">
            {items.length > 0
              ? t('bulletin.worshipTrackCount', { count: items.length })
              : t('bulletin.worshipNoPlaylist')}
          </h4>
        </div>

        {canAddSongs ? (
          <div className="bulletin-worship-toolbar" role="group" aria-label={t('bulletin.worshipSourceTabs')}>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => setSearchModalOpen(true)}
            >
              {t('bulletin.worshipOpenSearchModal')}
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setYoutubeModalOpen(true)}
            >
              {t('bulletin.worshipImportYoutubeBtn')}
            </button>
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
                  className="btn-secondary btn-sm"
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
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => setInviteModalOpen(true)}
                >
                  {t('bulletin.worshipOpenInviteModal')}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => void copyInviteLink()}
                >
                  {t('bulletin.worshipCopyInvite')}
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {(canManage || hasLyricsPptx) && (
          <p className="bulletin-worship-meta-line">
            {hasLyricsPptx
              ? t('bulletin.worshipLyricsPptxReady')
              : t('bulletin.worshipLyricsPptxEmpty')}
          </p>
        )}

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

      {status && <p className="success-msg">{status}</p>}
      {error && <p className="error-msg">{error}</p>}

      {youtubeModalOpen && canAddSongs ? (
        <div
          className="metadata-modal-overlay"
          role="presentation"
          onClick={() => setYoutubeModalOpen(false)}
        >
          <div
            className="metadata-modal bulletin-worship-youtube-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('bulletin.worshipImportYoutubeBtn')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="metadata-modal-header">
              <h3>{t('bulletin.worshipImportYoutubeTitle')}</h3>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setYoutubeModalOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
            <BulletinWorshipYoutubeImportPanel
              bulletinId={draft.id}
              oauthJustConnected={oauthJustConnected}
              oauthError={oauthError}
              onClearOauthError={onClearOauthError}
              onImported={(detail, meta) => {
                handleImported(detail, meta);
                setYoutubeModalOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}

      {inviteModalOpen && canManage ? (
        <BulletinWorshipInviteModal
          bulletinId={draft.id}
          onClose={() => setInviteModalOpen(false)}
          onInvited={({ inviteUrl: url, playlistId, emailedCount }) => {
            setInviteUrl(url);
            onPlaylistReady(playlistId);
            setStatus(
              emailedCount > 0
                ? t('bulletin.worshipInviteSentCount', { count: emailedCount })
                : t('bulletin.worshipInviteSent'),
            );
          }}
        />
      ) : null}

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
