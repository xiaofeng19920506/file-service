import { useCallback, useEffect, useState } from 'react';
import AcceptSharedPlaylistModal from '../components/AcceptSharedPlaylistModal';
import AddPlaylistItemsModal from '../components/AddPlaylistItemsModal';
import ConfirmModal from '../components/ConfirmModal';
import SharePlaylistModal from '../components/SharePlaylistModal';
import { DragHandleIcon, PencilIcon } from '../components/icons';
import YoutubePlaylistPlayer from '../components/YoutubePlaylistPlayer';
import {
  deletePlaylist,
  getPlaylist,
  importPlaylist,
  listPlaylists,
  reorderPlaylistItems,
  removePlaylistItem,
  updatePlaylist,
  type PlaylistDetail,
  type PlaylistItem,
  type PlaylistSummary,
} from '../api/playlists';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type PlaylistsPageProps = {
  selectedId?: string;
  shareToken?: string;
  onSelectId: (id: string | undefined) => void;
  onClearShareToken: () => void;
  onLoadToMerge: (playlistId: string) => void;
};

function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

type TrackDragOver = { index: number; after: boolean };

function remapActiveIndex(active: number, from: number, to: number): number {
  if (active === from) return to;
  if (from < to) {
    if (active > from && active <= to) return active - 1;
  } else if (from > to) {
    if (active >= to && active < from) return active + 1;
  }
  return active;
}

function reorderTrackItems(items: PlaylistItem[], from: number, target: TrackDragOver): PlaylistItem[] {
  let to = target.after ? target.index + 1 : target.index;
  if (from < to) to -= 1;
  if (from === to || from < 0 || to < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export default function PlaylistsPage({
  selectedId,
  shareToken,
  onSelectId,
  onClearShareToken,
  onLoadToMerge,
}: PlaylistsPageProps) {
  const { t, locale } = useI18n();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playerEngaged, setPlayerEngaged] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; title: string } | null>(null);
  const [trackDragIndex, setTrackDragIndex] = useState<number | null>(null);
  const [trackDragOver, setTrackDragOver] = useState<TrackDragOver | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const rows = await listPlaylists();
      setPlaylists(rows);
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : 'load_playlists_failed', t));
      setPlaylists([]);
    } finally {
      setLoadingList(false);
    }
  }, [t]);

  const loadDetail = useCallback(
    async (id: string) => {
      setLoadingDetail(true);
      setError(null);
      try {
        const data = await getPlaylist(id);
        setDetail(data);
        setActiveIndex(0);
        setPlaying(false);
        setPlayerEngaged(false);
      } catch (e) {
        setError(friendlyError(e instanceof Error ? e.message : 'load_playlist_failed', t));
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
      setPlaying(false);
      setPlayerEngaged(false);
      setActiveIndex(0);
    }
    setTrackDragIndex(null);
    setTrackDragOver(null);
  }, [selectedId, loadDetail]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = importUrl.trim();
    if (!url || importing) return;

    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const data = await importPlaylist(url);
      setImportUrl('');
      await loadList();
      onSelectId(data.playlist.id);
      setDetail(data);
      setActiveIndex(0);
      setPlaying(false);
      setPlayerEngaged(false);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'youtube_import_failed', t));
    } finally {
      setImporting(false);
    }
  };

  const performDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await deletePlaylist(id);
      if (selectedId === id) onSelectId(undefined);
      await loadList();
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : 'delete_failed', t));
    } finally {
      setDeletingId(null);
    }
  };

  const handleItemsAdded = async (
    data: PlaylistDetail,
    meta: { addedCount: number; skippedCount: number },
  ) => {
    setDetail(data);
    await loadList();
    if (meta.skippedCount > 0 && meta.addedCount > 0) {
      setNotice(
        t('playlists.addPartialDuplicate', {
          added: meta.addedCount,
          skipped: meta.skippedCount,
        }),
      );
    } else if (meta.skippedCount > 0) {
      setNotice(t('playlists.addAllDuplicate'));
    }
  };

  const applyTrackReorder = async (from: number, target: TrackDragOver) => {
    if (!selectedId || !detail || savingOrder) return;

    let to = target.after ? target.index + 1 : target.index;
    if (from < to) to -= 1;
    if (from === to) return;

    const reordered = reorderTrackItems(detail.items, from, target);
    const previousItems = detail.items;
    const previousActive = activeIndex;

    setDetail({ ...detail, items: reordered });
    setActiveIndex(remapActiveIndex(activeIndex, from, to));
    setSavingOrder(true);
    setError(null);

    try {
      const data = await reorderPlaylistItems(
        selectedId,
        reordered.map((item) => item.id),
      );
      setDetail(data);
      setActiveIndex(remapActiveIndex(previousActive, from, to));
      await loadList();
    } catch (e) {
      setDetail({ ...detail, items: previousItems });
      setActiveIndex(previousActive);
      setError(friendlyError(e instanceof Error ? e.message : 'reorder_playlist_failed', t));
    } finally {
      setSavingOrder(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!selectedId || removingItemId) return;
    setRemovingItemId(itemId);
    setError(null);
    try {
      await removePlaylistItem(selectedId, itemId);
      const data = await getPlaylist(selectedId);
      setDetail(data);
      if (activeIndex >= data.items.length) {
        setActiveIndex(Math.max(0, data.items.length - 1));
      }
      if (data.items.length === 0) {
        setPlaying(false);
        setPlayerEngaged(false);
      }
      await loadList();
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : 'remove_playlist_item_failed', t));
    } finally {
      setRemovingItemId(null);
    }
  };

  const engageAndPlay = (index: number) => {
    setActiveIndex(index);
    setPlaying(true);
    setPlayerEngaged(true);
  };

  const startPlayback = () => engageAndPlay(0);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const playerItems =
    detail?.items.map((item) => ({
      youtubeVideoId: item.youtubeVideoId,
      title: item.title,
    })) ?? [];

  const currentItem = detail?.items[activeIndex];
  const showPlayer = playerEngaged && playerItems.length > 0;

  const startRename = (id: string, title: string) => {
    setRenamingId(id);
    setRenameDraft(title);
    setError(null);
    if (selectedId !== id) onSelectId(id);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const saveRename = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!renamingId || savingRename) return;
    const title = renameDraft.trim();
    if (!title) {
      setError(friendlyError('title_required', t));
      return;
    }

    setSavingRename(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updatePlaylist(renamingId, title);
      if (selectedId === renamingId) setDetail(updated);
      setPlaylists((rows) =>
        rows.map((row) => (row.id === renamingId ? { ...row, title } : row)),
      );
      setRenamingId(null);
      setRenameDraft('');
      setNotice(t('playlists.renamed'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'update_playlist_failed', t));
    } finally {
      setSavingRename(false);
    }
  };

  const renderMainToolbar = (playlist: PlaylistDetail['playlist'], hasTracks: boolean) => (
    <div className="playlists-main-toolbar">
      {hasTracks && (
        <button type="button" className="btn-primary" onClick={startPlayback}>
          {t('playlists.playAll')}
        </button>
      )}
      <button type="button" className="btn-secondary" onClick={() => setShowAddModal(true)}>
        {t('playlists.addTitle')}
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() =>
          setShareTarget({
            id: playlist.id,
            title: playlist.title,
          })
        }
      >
        {t('playlists.share')}
      </button>
      {playlist.matchedCount > 0 && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onLoadToMerge(playlist.id)}
        >
          {t('playlists.loadToMerge')}
        </button>
      )}
      <button
        type="button"
        className="btn-secondary btn-danger-outline"
        disabled={deletingId === playlist.id}
        onClick={() =>
          setDeleteTarget({
            id: playlist.id,
            title: playlist.title,
          })
        }
      >
        {deletingId === playlist.id ? t('playlists.deleting') : t('playlists.delete')}
      </button>
    </div>
  );

  return (
    <div className="page-body page-body-playlists">
      <main className="playlists-page">
        <header className="playlists-header">
          <h1>{t('playlists.title')}</h1>
          <p className="playlists-intro">{t('playlists.intro')}</p>
        </header>

        {(error || notice) && (
          <div className="playlists-alerts">
            {error && <p className="error-msg playlists-alert">{error}</p>}
            {notice && <p className="playlists-notice">{notice}</p>}
          </div>
        )}

        <div className="playlists-workspace">
          <aside className="playlists-sidebar" aria-label={t('playlists.savedTitle')}>
            <form className="playlists-create-form" onSubmit={(e) => void handleImport(e)}>
              <label className="playlists-create-label" htmlFor="playlist-import-url">
                {t('playlists.importTitle')}
              </label>
              <div className="playlists-create-row">
                <input
                  id="playlist-import-url"
                  type="url"
                  className="playlists-text-input"
                  placeholder={t('playlists.importPlaceholder')}
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  disabled={importing}
                />
                <button
                  type="submit"
                  className="btn-primary playlists-create-btn"
                  disabled={importing || !importUrl.trim()}
                >
                  {importing ? t('playlists.importing') : t('playlists.importButton')}
                </button>
              </div>
            </form>

            <div className="playlists-sidebar-head">
              <h2>{t('playlists.savedTitle')}</h2>
              {!loadingList && playlists.length > 0 && (
                <span className="playlists-sidebar-count">{playlists.length}</span>
              )}
            </div>

            <div className="playlists-sidebar-list">
              {loadingList ? (
                <p className="playlists-muted">{t('playlists.loading')}</p>
              ) : playlists.length === 0 ? (
                <div className="playlists-empty-card">
                  <p className="playlists-empty-title">{t('playlists.emptyTitle')}</p>
                  <p className="playlists-muted">{t('playlists.empty')}</p>
                </div>
              ) : (
                <ul className="playlists-list">
                  {playlists.map((row) => (
                    <li
                      key={row.id}
                      className={`playlists-list-row${selectedId === row.id ? ' active' : ''}${renamingId === row.id ? ' renaming' : ''}`}
                    >
                      {renamingId === row.id ? (
                        <form
                          className="playlists-list-rename"
                          onSubmit={(e) => void saveRename(e)}
                        >
                          <input
                            type="text"
                            className="playlists-text-input playlists-list-rename-input"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            disabled={savingRename}
                            autoFocus
                            maxLength={200}
                            aria-label={t('playlists.renameLabel')}
                          />
                          <div className="playlists-list-rename-actions">
                            <button
                              type="submit"
                              className="btn-primary btn-compact"
                              disabled={savingRename || !renameDraft.trim()}
                            >
                              {savingRename ? t('playlists.renaming') : t('playlists.renameSave')}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-compact"
                              onClick={cancelRename}
                              disabled={savingRename}
                            >
                              {t('playlists.renameCancel')}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="playlists-list-row-inner">
                          <button
                            type="button"
                            className="playlists-list-rename-btn"
                            onClick={() => startRename(row.id, row.title)}
                            aria-label={t('playlists.rename')}
                            title={t('playlists.rename')}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="playlists-list-item"
                            onClick={() => {
                              if (renamingId !== null && renamingId !== row.id) {
                                cancelRename();
                              }
                              onSelectId(row.id);
                            }}
                          >
                            <span className="playlists-list-item-body">
                              <span className="playlists-list-title">{row.title}</span>
                              <span className="playlists-list-meta">
                                {t('playlists.trackCount', { count: row.itemCount })}
                                <span className="playlists-list-dot">·</span>
                                {formatDate(row.createdAt)}
                              </span>
                            </span>
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <section className="playlists-main" aria-live="polite">
            {!selectedId ? (
              <div className="playlists-placeholder">
                <div className="playlists-placeholder-icon" aria-hidden>
                  ▶
                </div>
                <p className="playlists-placeholder-title">{t('playlists.placeholderTitle')}</p>
                <p className="playlists-muted">{t('playlists.selectPrompt')}</p>
              </div>
            ) : loadingDetail ? (
              <div className="playlists-placeholder">
                <p className="playlists-muted">{t('playlists.loadingDetail')}</p>
              </div>
            ) : detail ? (
              <div className="playlists-main-inner">
                {renderMainToolbar(detail.playlist, detail.items.length > 0)}

                {detail.items.length === 0 ? (
                  <div className="playlists-empty-card playlists-empty-tracks">
                    <p className="playlists-empty-title">{t('playlists.noTracksTitle')}</p>
                    <p className="playlists-muted">{t('playlists.noTracksHint')}</p>
                  </div>
                ) : (
                  <div className="playlists-player-stage">
                    <div className="playlists-player-col">
                      {!showPlayer && currentItem && (
                        <button
                          type="button"
                          className="playlists-hero"
                          onClick={startPlayback}
                          aria-label={t('playlists.playAll')}
                        >
                          <img
                            className="playlists-hero-thumb"
                            src={youtubeThumb(currentItem.youtubeVideoId)}
                            alt=""
                            loading="lazy"
                          />
                          <span className="playlists-hero-overlay">
                            <span className="playlists-hero-play-icon" aria-hidden>
                              ▶
                            </span>
                            <span className="playlists-hero-play-label">
                              {t('playlists.startPlayback')}
                            </span>
                          </span>
                        </button>
                      )}

                      {showPlayer && (
                        <YoutubePlaylistPlayer
                          items={playerItems}
                          activeIndex={activeIndex}
                          onActiveIndexChange={setActiveIndex}
                          playing={playing}
                          onPlayingChange={setPlaying}
                        />
                      )}
                    </div>

                    <aside className="playlists-tracks-col" aria-label={t('playlists.tracksTitle')}>
                      <div className="playlists-tracks-head">
                        <h3>{t('playlists.tracksTitle')}</h3>
                      </div>
                      <ol className={`playlists-tracks${savingOrder ? ' saving-order' : ''}`}>
                        {detail.items.map((item, index) => {
                          const isActive = index === activeIndex;
                          const isPlaying = isActive && playing;
                          const isDragging = trackDragIndex === index;
                          const isDragOverBefore =
                            trackDragOver?.index === index && !trackDragOver.after;
                          const isDragOverAfter =
                            trackDragOver?.index === index && trackDragOver.after;
                          return (
                            <li
                              key={item.id}
                              className={`playlists-track${isActive ? ' active' : ''}${isPlaying ? ' playing' : ''}${isDragging ? ' dragging' : ''}${isDragOverBefore ? ' drag-over-before' : ''}${isDragOverAfter ? ' drag-over-after' : ''}`}
                              onDragOver={(e) => {
                                if (trackDragIndex === null || savingOrder) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                const rect = e.currentTarget.getBoundingClientRect();
                                const after = e.clientY > rect.top + rect.height / 2;
                                setTrackDragOver({ index, after });
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (trackDragIndex !== null && trackDragOver) {
                                  void applyTrackReorder(trackDragIndex, trackDragOver);
                                }
                                setTrackDragIndex(null);
                                setTrackDragOver(null);
                              }}
                              onDragLeave={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                  setTrackDragOver((prev) =>
                                    prev?.index === index ? null : prev,
                                  );
                                }
                              }}
                            >
                              <span
                                className={`playlists-track-drag-handle${savingOrder ? ' disabled' : ''}`}
                                title={t('playlists.dragToReorder')}
                                draggable={!savingOrder}
                                onDragStart={(e) => {
                                  if (savingOrder) {
                                    e.preventDefault();
                                    return;
                                  }
                                  e.dataTransfer.effectAllowed = 'move';
                                  setTrackDragIndex(index);
                                }}
                                onDragEnd={() => {
                                  setTrackDragIndex(null);
                                  setTrackDragOver(null);
                                }}
                              >
                                <DragHandleIcon />
                              </span>
                              <button
                                type="button"
                                className="playlists-track-main"
                                onClick={() => engageAndPlay(index)}
                                title={item.title}
                              >
                                <span className="playlists-track-thumb-wrap">
                                  <img
                                    className="playlists-track-thumb"
                                    src={youtubeThumb(item.youtubeVideoId)}
                                    alt=""
                                    loading="lazy"
                                    draggable={false}
                                  />
                                  <span className="playlists-track-play-icon" aria-hidden>
                                    {isPlaying ? '▮▮' : '▶'}
                                  </span>
                                </span>
                                <span className="playlists-track-title">{item.title}</span>
                              </button>
                              <button
                                type="button"
                                className="playlists-track-remove"
                                disabled={removingItemId === item.id || savingOrder}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleRemoveItem(item.id);
                                }}
                                aria-label={t('playlists.removeTrack', { title: item.title })}
                              >
                                {removingItemId === item.id ? '…' : '×'}
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </aside>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </main>

      {showAddModal && selectedId && (
        <AddPlaylistItemsModal
          playlistId={selectedId}
          onClose={() => setShowAddModal(false)}
          onAdded={(data, meta) => {
            setError(null);
            setNotice(null);
            void handleItemsAdded(data, meta);
          }}
        />
      )}

      {shareTarget && (
        <SharePlaylistModal
          playlistId={shareTarget.id}
          playlistTitle={shareTarget.title}
          onClose={() => setShareTarget(null)}
          onSent={() => setNotice(t('playlists.shareSent'))}
        />
      )}

      {shareToken && (
        <AcceptSharedPlaylistModal
          shareToken={shareToken}
          onClose={onClearShareToken}
          onAccepted={(data) => {
            void loadList();
            onSelectId(data.playlist.id);
            setDetail(data);
            setNotice(t('playlists.shareAccepted'));
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={t('playlists.deleteConfirmTitle')}
          message={t('playlists.deleteConfirm', { title: deleteTarget.title })}
          confirmLabel={t('playlists.delete')}
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const id = deleteTarget.id;
            setDeleteTarget(null);
            void performDelete(id);
          }}
        />
      )}
    </div>
  );
}
