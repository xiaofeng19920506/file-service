import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AcceptSharedPlaylistModal from '../components/AcceptSharedPlaylistModal';
import AddPlaylistItemsModal from '../components/AddPlaylistItemsModal';
import ConfirmModal from '../components/ConfirmModal';
import SharePlaylistModal from '../components/SharePlaylistModal';
import { DragHandleIcon, PencilIcon } from '../components/icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import PlaylistAudioPlayer, {
  type PlaylistAudioProgressHandle,
} from '../components/PlaylistAudioPlayer';
import PlaylistNowPlayingShell from '../components/PlaylistNowPlayingShell';
import PlaylistPlayerBottomChrome from '../components/PlaylistPlayerBottomChrome';
import PlaylistQueuePanel from '../components/PlaylistQueuePanel';
import YoutubePlaylistPlayer from '../components/YoutubePlaylistPlayer';
import { prioritizeYoutubeAudioCache, type YoutubeAudioStatus } from '../api/youtube-audio';
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
import {
  readPlaylistPlaybackMode,
  writePlaylistPlaybackMode,
  type PlaylistPlaybackMode,
} from '../lib/playlist-playback-mode';
import {
  cyclePlaylistRepeatMode,
  readPlaylistRepeatMode,
  writePlaylistRepeatMode,
  type PlaylistRepeatMode,
} from '../lib/playlist-repeat-mode';
import {
  buildShuffleOrder,
  readPlaylistShuffleEnabled,
  writePlaylistShuffleEnabled,
} from '../lib/playlist-shuffle';
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
  const audioProgressHandleRef = useRef<PlaylistAudioProgressHandle | null>(null);
  const [playerEngaged, setPlayerEngaged] = useState(false);
  const [playerView, setPlayerView] = useState<'nowPlaying' | 'browse'>('browse');
  const [queueOpen, setQueueOpen] = useState(false);
  const [repeatMode, setRepeatMode] = useState<PlaylistRepeatMode>(readPlaylistRepeatMode);
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const isMobileViewport = useMediaQuery('(max-width: 900px)');

  useEffect(() => {
    setToolbarExpanded(false);
  }, [selectedId]);
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
  const [playbackMode, setPlaybackMode] = useState<PlaylistPlaybackMode>(readPlaylistPlaybackMode);
  const [shuffleEnabled, setShuffleEnabled] = useState(readPlaylistShuffleEnabled);
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [shuffleCursor, setShuffleCursor] = useState(0);

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
        setPlayerView('browse');
        setQueueOpen(false);
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
    setShuffleOrder([]);
    setShuffleCursor(0);
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

  const itemCount = detail?.items.length ?? 0;

  const syncShuffleCursorForIndex = useCallback(
    (index: number, order: number[]) => {
      const cursor = order.indexOf(index);
      setShuffleCursor(cursor >= 0 ? cursor : 0);
    },
    [],
  );

  const beginShuffleRound = useCallback(
    (length: number, startIndex?: number) => {
      if (length <= 0) {
        setShuffleOrder([]);
        setShuffleCursor(0);
        return [] as number[];
      }
      const order = buildShuffleOrder(length);
      setShuffleOrder(order);
      if (startIndex !== undefined) {
        syncShuffleCursorForIndex(startIndex, order);
      } else {
        setShuffleCursor(0);
      }
      return order;
    },
    [syncShuffleCursorForIndex],
  );

  useEffect(() => {
    if (!shuffleEnabled) {
      setShuffleOrder([]);
      setShuffleCursor(0);
      return;
    }
    if (itemCount > 0 && shuffleOrder.length !== itemCount) {
      beginShuffleRound(itemCount);
    }
  }, [shuffleEnabled, itemCount, shuffleOrder.length, beginShuffleRound]);

  const goToNextTrack = useCallback(() => {
    if (!detail?.items.length) return;

    if (shuffleEnabled) {
      const order =
        shuffleOrder.length === detail.items.length
          ? shuffleOrder
          : beginShuffleRound(detail.items.length, activeIndex);
      let nextCursor = shuffleCursor + 1;
      if (nextCursor >= detail.items.length) {
        if (repeatMode === 'all') {
          const nextOrder = buildShuffleOrder(detail.items.length);
          setShuffleOrder(nextOrder);
          setShuffleCursor(0);
          setActiveIndex(nextOrder[0]!);
          setPlaying(true);
        } else {
          setPlaying(false);
        }
      } else {
        setShuffleCursor(nextCursor);
        setActiveIndex(order[nextCursor]!);
        setPlaying(true);
      }
      return;
    }

    if (activeIndex < detail.items.length - 1) {
      setActiveIndex(activeIndex + 1);
      setPlaying(true);
    } else if (repeatMode === 'all') {
      setActiveIndex(0);
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }, [
    detail?.items.length,
    shuffleEnabled,
    shuffleOrder,
    shuffleCursor,
    activeIndex,
    beginShuffleRound,
    repeatMode,
  ]);

  const goToPrevTrack = useCallback(() => {
    if (!detail?.items.length) return;

    if (shuffleEnabled && shuffleOrder.length === detail.items.length) {
      if (shuffleCursor > 0) {
        const prevCursor = shuffleCursor - 1;
        setShuffleCursor(prevCursor);
        setActiveIndex(shuffleOrder[prevCursor]!);
        setPlaying(true);
      }
      return;
    }

    if (activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
      setPlaying(true);
    }
  }, [detail?.items.length, shuffleEnabled, shuffleOrder, shuffleCursor, activeIndex]);

  const canGoPrev = shuffleEnabled ? shuffleCursor > 0 : activeIndex > 0;
  const canGoNext = shuffleEnabled ? itemCount > 0 : activeIndex < itemCount - 1;

  const engageAndPlay = (index: number) => {
    if (shuffleEnabled && detail?.items.length) {
      if (shuffleOrder.length !== detail.items.length) {
        beginShuffleRound(detail.items.length, index);
      } else {
        syncShuffleCursorForIndex(index, shuffleOrder);
      }
    }
    setActiveIndex(index);
    setPlaying(true);
    setPlayerEngaged(true);
    if (playbackMode === 'audio') {
      setPlayerView('nowPlaying');
    }
  };

  const startPlayback = () => {
    if (!detail?.items.length) return;
    if (shuffleEnabled) {
      const order = beginShuffleRound(detail.items.length);
      engageAndPlay(order[0]!);
      return;
    }
    engageAndPlay(0);
  };

  const toggleShuffle = () => {
    const next = !shuffleEnabled;
    setShuffleEnabled(next);
    writePlaylistShuffleEnabled(next);
    if (next && detail?.items.length) {
      beginShuffleRound(detail.items.length, activeIndex);
    }
  };

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
      audio: item.audio,
    })) ?? [];

  const audioCachePriorityIds = useMemo(() => {
    if (!detail?.items.length) return [] as string[];
    const ids: string[] = [];
    const pushIndex = (idx: number) => {
      const id = detail.items[idx]?.youtubeVideoId;
      if (id && !ids.includes(id)) ids.push(id);
    };
    pushIndex(activeIndex);
    if (shuffleEnabled && shuffleOrder.length === detail.items.length) {
      const cursor = shuffleOrder.indexOf(activeIndex);
      const start = cursor >= 0 ? cursor : shuffleCursor;
      for (let i = start + 1; i < shuffleOrder.length; i++) pushIndex(shuffleOrder[i]!);
      for (let i = 0; i < start; i++) pushIndex(shuffleOrder[i]!);
    } else {
      for (let i = activeIndex + 1; i < detail.items.length; i++) pushIndex(i);
      for (let i = 0; i < activeIndex; i++) pushIndex(i);
    }
    return ids;
  }, [detail?.items, activeIndex, shuffleEnabled, shuffleOrder, shuffleCursor]);

  useEffect(() => {
    if (playbackMode !== 'audio' || audioCachePriorityIds.length === 0 || !detail?.items.length) {
      return;
    }
    void prioritizeYoutubeAudioCache(
      audioCachePriorityIds,
      detail.items.map((item) => ({ videoId: item.youtubeVideoId, title: item.title })),
    );
  }, [playbackMode, audioCachePriorityIds, detail?.items]);

  const handleAudioStatusChange = useCallback((videoId: string, status: YoutubeAudioStatus) => {
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.youtubeVideoId === videoId ? { ...item, audio: status } : item,
        ),
      };
    });
  }, []);

  const currentItem = detail?.items[activeIndex];
  const showPlayer = playerEngaged && playerItems.length > 0;
  const videoImmersive = showPlayer && playbackMode === 'video';
  const audioNowPlaying = showPlayer && playbackMode === 'audio' && playerView === 'nowPlaying';
  const audioMinimized = showPlayer && playbackMode === 'audio' && playerView === 'browse';

  useEffect(() => {
    if (!audioNowPlaying) {
      document.body.classList.remove('playlists-immersive-active');
      return;
    }
    document.body.classList.add('playlists-immersive-active');
    return () => {
      document.body.classList.remove('playlists-immersive-active');
    };
  }, [audioNowPlaying]);

  useEffect(() => {
    if (!videoImmersive) {
      document.body.classList.remove('playlists-video-immersive-active');
      return;
    }
    document.body.classList.add('playlists-video-immersive-active');
    return () => {
      document.body.classList.remove('playlists-video-immersive-active');
    };
  }, [videoImmersive]);

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

  const onPlaybackModeChange = (mode: PlaylistPlaybackMode) => {
    setPlaybackMode(mode);
    writePlaylistPlaybackMode(mode);
    setQueueOpen(false);
    if (mode === 'audio') {
      setPlayerView('nowPlaying');
    } else {
      setPlayerView('browse');
    }
  };

  const cycleRepeat = () => {
    const next = cyclePlaylistRepeatMode(repeatMode);
    setRepeatMode(next);
    writePlaylistRepeatMode(next);
  };

  const changeRepeatMode = (mode: PlaylistRepeatMode) => {
    setRepeatMode(mode);
    writePlaylistRepeatMode(mode);
  };

  const renderShuffleToggle = () => (
    <button
      type="button"
      className={`playlists-shuffle-btn${shuffleEnabled ? ' active' : ''}`}
      aria-pressed={shuffleEnabled}
      aria-label={t('playlists.shuffle')}
      title={t('playlists.shuffle')}
      onClick={toggleShuffle}
    >
      {t('playlists.shuffleShort')}
    </button>
  );

  const renderPlaybackModeToggle = () => (
    <div className="playlists-playback-mode" role="group" aria-label={t('playlists.playbackMode')}>
      <button
        type="button"
        className={`playlists-playback-mode-btn${playbackMode === 'audio' ? ' active' : ''}`}
        aria-pressed={playbackMode === 'audio'}
        onClick={() => onPlaybackModeChange('audio')}
      >
        {t('playlists.playbackMp3')}
      </button>
      <button
        type="button"
        className={`playlists-playback-mode-btn${playbackMode === 'video' ? ' active' : ''}`}
        aria-pressed={playbackMode === 'video'}
        onClick={() => onPlaybackModeChange('video')}
      >
        {t('playlists.playbackVideo')}
      </button>
    </div>
  );

  const renderPlayerChromeProps = () => ({
    onToggleQueue: () => setQueueOpen((open) => !open),
    repeatMode,
    onCycleRepeat: cycleRepeat,
    shuffleEnabled,
    onToggleShuffle: toggleShuffle,
    playbackMode,
    onPlaybackModeChange,
  });

  const renderQueuePanel = () =>
    detail ? (
      <PlaylistQueuePanel
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        items={detail.items}
        activeIndex={activeIndex}
        playing={playing}
        onSelectTrack={engageAndPlay}
        onRemoveTrack={(id) => void handleRemoveItem(id)}
        removingItemId={removingItemId}
        savingOrder={savingOrder}
        trackDragIndex={trackDragIndex}
        trackDragOver={trackDragOver}
        onDragStart={setTrackDragIndex}
        onDragEnd={() => {
          setTrackDragIndex(null);
          setTrackDragOver(null);
        }}
        onDragOver={(index, after) => setTrackDragOver({ index, after })}
        onDragLeave={() => setTrackDragOver(null)}
        onDrop={(from, target) => void applyTrackReorder(from, target)}
      />
    ) : null;

  const renderAudioPlayer = (variant: 'default' | 'nowPlaying') =>
    showPlayer && playbackMode === 'audio' ? (
      <PlaylistAudioPlayer
        items={playerItems}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        playing={playing}
        onPlayingChange={setPlaying}
        onAudioStatusChange={handleAudioStatusChange}
        onNextTrack={goToNextTrack}
        onPrevTrack={goToPrevTrack}
        canGoNext={canGoNext}
        canGoPrev={canGoPrev}
        progressHandleRef={audioProgressHandleRef}
        playlistTitle={detail?.playlist.title}
        variant={variant}
        repeatMode={repeatMode}
        onCycleRepeat={cycleRepeat}
        onRepeatModeChange={changeRepeatMode}
        shuffleEnabled={shuffleEnabled}
        onToggleShuffle={toggleShuffle}
        onToggleQueue={() => setQueueOpen((open) => !open)}
        queueOpen={queueOpen}
      />
    ) : null;

  const renderMainToolbar = (playlist: PlaylistDetail['playlist'], hasTracks: boolean) => (
    <div
      className={`playlists-main-toolbar${toolbarExpanded ? ' is-expanded' : ''}${showPlayer ? ' has-player' : ''}`}
    >
      <button
        type="button"
        className="btn-secondary playlists-mobile-back"
        onClick={() => onSelectId(undefined)}
      >
        {t('playlists.backToList')}
      </button>

      <div className="playlists-toolbar-primary desktop-only">
        {hasTracks && (
          <>
            {renderPlaybackModeToggle()}
            <button
              type="button"
              className={`playlists-repeat-btn${repeatMode !== 'off' ? ' active' : ''}`}
              onClick={cycleRepeat}
              aria-label={
                repeatMode === 'one'
                  ? t('playlists.repeatOne')
                  : repeatMode === 'all'
                    ? t('playlists.repeatAll')
                    : t('playlists.repeatOff')
              }
            >
              {repeatMode === 'one' ? '1' : repeatMode === 'all' ? '∞' : '↻'}
            </button>
            {renderShuffleToggle()}
            <button type="button" className="btn-primary" onClick={startPlayback}>
              {t('playlists.playAll')}
            </button>
          </>
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

      <div className="playlists-toolbar-mobile mobile-only">
        {hasTracks && (
          <>
            {renderPlaybackModeToggle()}
            <button
              type="button"
              className="btn-primary playlists-btn-play-all"
              onClick={startPlayback}
            >
              {t('playlists.playAll')}
            </button>
            <div className="playlists-toolbar-row">
              {renderShuffleToggle()}
              <button type="button" className="btn-secondary" onClick={() => setShowAddModal(true)}>
                {t('playlists.addTitle')}
              </button>
            </div>
          </>
        )}
        {!hasTracks && (
          <button type="button" className="btn-secondary" onClick={() => setShowAddModal(true)}>
            {t('playlists.addTitle')}
          </button>
        )}
      </div>

      <div className="playlists-toolbar-more mobile-only">
        <button
          type="button"
          className="playlists-toolbar-more-toggle"
          aria-expanded={toolbarExpanded}
          onClick={() => setToolbarExpanded((open) => !open)}
        >
          <span>{t('common.more')}</span>
          <span className="playlists-toolbar-more-toggle-icon" aria-hidden>
            ▾
          </span>
        </button>
        <div className="playlists-toolbar-secondary">
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
      </div>
    </div>
  );

  return (
    <div className="page-body page-body-playlists">
      <main
        className="playlists-page"
        data-video-immersive={videoImmersive ? 'true' : 'false'}
        data-audio-now-playing={audioNowPlaying ? 'true' : 'false'}
      >
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

        <div
          className="playlists-workspace"
          data-mobile-view={selectedId ? 'detail' : 'list'}
          data-player-active={showPlayer ? 'true' : 'false'}
          data-audio-now-playing={audioNowPlaying ? 'true' : 'false'}
          data-playback-mode={playbackMode}
        >
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
              audioNowPlaying ? (
                <div className="playlists-main-inner playlists-main-inner--audio-now-playing">
                  <PlaylistNowPlayingShell
                    playlistTitle={detail.playlist.title}
                    trackTitle={currentItem?.title ?? ''}
                    trackCurrent={activeIndex + 1}
                    trackTotal={detail.items.length}
                    onMinimize={() => setPlayerView('browse')}
                    {...renderPlayerChromeProps()}
                  >
                    {renderAudioPlayer('nowPlaying')}
                  </PlaylistNowPlayingShell>
                  {renderQueuePanel()}
                </div>
              ) : (
              <div
                className={`playlists-main-inner${videoImmersive ? ' playlists-main-inner--video-immersive' : ''}`}
              >
                {!videoImmersive && renderMainToolbar(detail.playlist, detail.items.length > 0)}

                {detail.items.length === 0 ? (
                  <div className="playlists-empty-card playlists-empty-tracks">
                    <p className="playlists-empty-title">{t('playlists.noTracksTitle')}</p>
                    <p className="playlists-muted">{t('playlists.noTracksHint')}</p>
                  </div>
                ) : (
                  <div
                    className="playlists-player-stage"
                    data-playback-mode={playbackMode}
                    data-player-engaged={showPlayer ? 'true' : 'false'}
                    data-video-immersive={videoImmersive ? 'true' : 'false'}
                    data-queue-open={queueOpen ? 'true' : 'false'}
                  >
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

                      {audioMinimized && (
                        <div className="playlist-audio-player-headless-wrap" aria-hidden>
                          {renderAudioPlayer('default')}
                        </div>
                      )}

                      {showPlayer && playbackMode === 'video' && (
                        <YoutubePlaylistPlayer
                          items={playerItems}
                          activeIndex={activeIndex}
                          onActiveIndexChange={setActiveIndex}
                          playing={playing}
                          onPlayingChange={setPlaying}
                          onNextTrack={goToNextTrack}
                          onPrevTrack={goToPrevTrack}
                          canGoNext={canGoNext}
                          canGoPrev={canGoPrev}
                          immersive={videoImmersive}
                          lockLandscape={isMobileViewport}
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
              )
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

      {videoImmersive && (
        <>
          <PlaylistPlayerBottomChrome
            className="playlist-video-chrome"
            {...renderPlayerChromeProps()}
          />
          {renderQueuePanel()}
        </>
      )}

      {audioMinimized && currentItem && detail && (
        <div
          className="playlists-mini-player"
          role="button"
          tabIndex={0}
          onClick={() => setPlayerView('nowPlaying')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setPlayerView('nowPlaying');
            }
          }}
        >
          <img
            className="playlists-mini-player-thumb"
            src={youtubeThumb(currentItem.youtubeVideoId)}
            alt=""
          />
          <div className="playlists-mini-player-meta">
            <div className="playlists-mini-player-title">{currentItem.title}</div>
            <div className="playlists-mini-player-sub">{detail.playlist.title}</div>
          </div>
          <button
            type="button"
            className="playlists-mini-player-btn"
            aria-label={playing ? t('playlists.pause') : t('playlists.play')}
            onClick={(e) => {
              e.stopPropagation();
              setPlaying((was) => !was);
            }}
          >
            {playing ? '▮▮' : '▶'}
          </button>
        </div>
      )}
    </div>
  );
}
