import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBulletinWorshipPlaylist,
  patchBulletinWorshipPlaylistItem,
  removeBulletinWorshipPlaylistItem,
  reorderBulletinWorshipPlaylistItems,
  updateBulletin,
  type WeeklyBulletin,
} from '../../api/bulletins';
import { uploadFile } from '../../api/client';
import type { PlaylistDetail, PlaylistItem } from '../../api/playlists';
import BulletinWorshipAddSongsModal from './BulletinWorshipAddSongsModal';
import BulletinWorshipInviteModal from './BulletinWorshipInviteModal';
import { friendlyError } from '../../lib/error-messages';
import {
  formatClipSummary,
  normalizeWorshipPresentationMode,
  resolvePlayClips,
  worshipNeedsLyricsPptx,
  worshipNeedsPlaylist,
  type PlayClip,
  type WorshipPresentationMode,
} from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';
import { useSortableVerticalList } from '../../hooks/useSortableVerticalList';
import WorshipTrackActions from '../worship/WorshipTrackActions';

type BulletinWorshipStepProps = {
  draft: WeeklyBulletin;
  canManage: boolean;
  canEditSongs: boolean;
  oauthJustConnected?: boolean;
  oauthError?: string | null;
  onClearOauthError?: () => void;
  playlistRefreshKey?: number;
  onPlaylistReady: (playlistId: string) => void;
  onPlaylistChanged?: () => void;
  onLyricsPptxChange?: (blobId: string | null) => void;
  onPersistPresentationMode?: (mode: WorshipPresentationMode) => Promise<void>;
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
  onPersistPresentationMode,
}: BulletinWorshipStepProps) {
  const { t } = useI18n();
  const lyricsFileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lyricsUploading, setLyricsUploading] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [addSongsOpen, setAddSongsOpen] = useState(
    Boolean(oauthJustConnected || oauthError),
  );
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const mode = normalizeWorshipPresentationMode(draft.worshipPresentationMode);
  const showPlaylist = worshipNeedsPlaylist(mode);
  const showPptx = worshipNeedsLyricsPptx(mode);
  const canAddSongs = (canEditSongs || canManage) && showPlaylist;
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
    if (!showPlaylist) return;
    void refreshPlaylist().catch(() => undefined);
  }, [refreshPlaylist, draft.servicePlaylistId, playlistRefreshKey, showPlaylist]);

  useEffect(() => {
    if (oauthJustConnected || oauthError) setAddSongsOpen(true);
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

  const changeMode = async (next: WorshipPresentationMode) => {
    if (next === mode || modeSaving || !onPersistPresentationMode) return;
    setModeSaving(true);
    setError(null);
    try {
      await onPersistPresentationMode(next);
      setStatus(t('bulletin.worshipModeUpdated'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
    } finally {
      setModeSaving(false);
    }
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

  const handleReorderCommit = useCallback(
    async (from: number, toIndex: number) => {
      const reordered = reorderToFinalIndex(itemsRef.current, from, toIndex);
      setItems(reordered);
      try {
        const data = await reorderBulletinWorshipPlaylistItems(
          draft.id,
          reordered.map((row) => row.id),
        );
        setItems(data.items);
        onPlaylistChanged?.();
      } catch (err) {
        setError(friendlyError(err instanceof Error ? err.message : 'reorder_playlist_failed', t));
        await refreshPlaylist();
      }
    },
    [draft.id, onPlaylistChanged, refreshPlaylist, t],
  );

  const trackSortable = useSortableVerticalList({
    enabled: canAddSongs && items.length > 1,
    listRef,
    onCommit: (from, toIndex) => void handleReorderCommit(from, toIndex),
  });

  const handleClipSave = async (itemId: string, patch: { playClips: PlayClip[] | null }) => {
    const detail = await patchBulletinWorshipPlaylistItem(draft.id, itemId, patch);
    setItems(detail.items);
    onPlaylistChanged?.();
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
      <fieldset className="bulletin-worship-mode-fieldset" disabled={!canManage || modeSaving}>
        <legend>{t('bulletin.worshipModeLabel')}</legend>
        <div className="bulletin-worship-mode-top">
          <div className="bulletin-worship-mode-options" role="radiogroup">
            {(
              [
                ['ppt', 'bulletin.worshipModePpt'],
                ['youtube', 'bulletin.worshipModeYoutube'],
                ['ppt_youtube', 'bulletin.worshipModePptYoutube'],
              ] as const
            ).map(([value, labelKey]) => (
              <label key={value} className="bulletin-worship-mode-option">
                <input
                  type="radio"
                  name="worship-presentation-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => void changeMode(value)}
                />
                <span>{t(labelKey)}</span>
              </label>
            ))}
          </div>
          {canManage ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setInviteModalOpen(true)}
            >
              {t('bulletin.worshipOpenInviteModal')}
            </button>
          ) : null}
        </div>
      </fieldset>

      {showPptx ? (
        <section className="bulletin-worship-pptx-section">
          <div className="bulletin-worship-playlist-heading-row">
            <h4 className="bulletin-worship-playlist-heading">{t('bulletin.worshipLyricsPptxTitle')}</h4>
            {canManage ? (
              <div className="bulletin-worship-toolbar">
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
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showPlaylist ? (
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
                className="btn-primary btn-sm"
                onClick={() => setAddSongsOpen(true)}
              >
                {t('bulletin.worshipAddSongs')}
              </button>
            ) : null}
          </div>

          {items.length > 0 ? (
            <>
              {canAddSongs && items.length > 1 ? (
                <p className="bulletin-worship-reorder-hint">{t('bulletin.worshipReorderHint')}</p>
              ) : null}
              <ol
                ref={listRef}
                className={`bulletin-worship-track-preview${trackSortable.isSorting ? ' is-sorting' : ''}`}
              >
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className={[
                      'bulletin-worship-track-preview-item',
                      canAddSongs ? 'is-sortable' : '',
                      trackSortable.isDraggingItem(index) ? 'is-dragging' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={canAddSongs ? trackSortable.getItemStyle(index) : undefined}
                    {...(canAddSongs
                      ? trackSortable.bindDragHandle(index, { ignoreInteractive: true })
                      : {})}
                  >
                    <span className="bulletin-worship-track-preview-order">{index + 1}</span>
                    <div className="bulletin-worship-track-preview-main">
                      {canAddSongs ? (
                        <WorshipTrackActions
                          item={item}
                          title={item.title}
                          onRemove={() => handleRemove(item)}
                          onClipSave={(patch) => handleClipSave(item.id, patch)}
                        />
                      ) : (
                        <>
                          <span className="bulletin-worship-track-preview-title">{item.title}</span>
                          {resolvePlayClips(item).length > 0 ? (
                            <span className="bulletin-worship-clip-summary">
                              {resolvePlayClips(item).map((c) => formatClipSummary(c)).join(' · ')}
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      ) : null}

      {status && <p className="success-msg">{status}</p>}
      {error && <p className="error-msg">{error}</p>}

      {addSongsOpen && canAddSongs ? (
        <BulletinWorshipAddSongsModal
          bulletinId={draft.id}
          existingVideoIds={existingVideoIds}
          initialTab={oauthJustConnected || oauthError ? 'youtube' : 'search'}
          oauthJustConnected={oauthJustConnected}
          oauthError={oauthError}
          onClearOauthError={onClearOauthError}
          onClose={() => setAddSongsOpen(false)}
          onAdded={(detail, meta) => {
            handleImported(detail, meta);
            setAddSongsOpen(false);
          }}
        />
      ) : null}

      {inviteModalOpen && canManage ? (
        <BulletinWorshipInviteModal
          bulletinId={draft.id}
          onClose={() => setInviteModalOpen(false)}
          onInvited={({ playlistId, emailedCount }) => {
            onPlaylistReady(playlistId);
            setStatus(
              emailedCount > 0
                ? t('bulletin.worshipInviteSentCount', { count: emailedCount })
                : t('bulletin.worshipInviteSent'),
            );
          }}
        />
      ) : null}
    </div>
  );
}
