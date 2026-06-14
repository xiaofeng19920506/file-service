import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AcceptSharedPlaylistModal from '../components/AcceptSharedPlaylistModal';
import AddPlaylistItemsModal from '../components/AddPlaylistItemsModal';
import PlaylistYoutubeSearchPanel from '../components/PlaylistYoutubeSearchPanel';
import ConfirmModal from '../components/ConfirmModal';
import SharePlaylistModal from '../components/SharePlaylistModal';
import ExportYoutubePlaylistModal from '../components/ExportYoutubePlaylistModal';
import { DragHandleIcon, PencilIcon } from '../components/icons';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import PlaylistAudioPlayer, {
  type PlaylistAudioProgressHandle,
  type PlaylistAudioProgressState,
} from '../components/PlaylistAudioPlayer';
import PlaylistDesktopAudioCenter from '../components/PlaylistDesktopAudioCenter';
import PlaylistsMobilePlaybackDock from '../components/PlaylistsMobilePlaybackDock';
import PlaylistQueuePanel from '../components/PlaylistQueuePanel';
import YoutubePlaylistPlayer from '../components/YoutubePlaylistPlayer';
import { prioritizeYoutubeAudioCache, type YoutubeAudioStatus } from '../api/youtube-audio';
import {
  deletePlaylist,
  createPlaylist,
  getPlaylist,
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
import { usePlaylistsMobileMenu, PlaylistsMobileMenuPortal } from '../contexts/PlaylistsMobileMenuContext';
import { useAuth } from '../auth/AuthContext';
import { readLastPlaylistId, writeLastPlaylistId } from '../lib/playlist-last-open';

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
  const { permissions } = useAuth();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [listSearchTargetId, setListSearchTargetId] = useState<string | undefined>(undefined);
  const [listSearchExistingVideoIds, setListSearchExistingVideoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [newListTitle, setNewListTitle] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playerEngaged, setPlayerEngaged] = useState(false);
  const [repeatMode, setRepeatMode] = useState<PlaylistRepeatMode>(readPlaylistRepeatMode);
  const [tracksEditMode, setTracksEditMode] = useState(false);
  const isMobileViewport = useMediaQuery(MOBILE_MEDIA_QUERY);
  const { closeMenu } = usePlaylistsMobileMenu();

  useEffect(() => {
    setTracksEditMode(false);
    setQueueOpen(false);
  }, [selectedId]);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; title: string } | null>(null);
  const [exportTarget, setExportTarget] = useState<{
    id: string;
    title: string;
    trackCount: number;
  } | null>(null);
  const [oauthJustConnected, setOauthJustConnected] = useState(false);
  const oauthHandledRef = useRef(false);
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
  const [queueOpen, setQueueOpen] = useState(false);
  const [audioProgress, setAudioProgress] = useState<PlaylistAudioProgressState>({
    currentTime: 0,
    duration: 0,
    canSeek: false,
  });
  const audioProgressHandleRef = useRef<PlaylistAudioProgressHandle | null>(null);

  useEffect(() => {
    if (oauthHandledRef.current) return;

    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;

    const params = new URLSearchParams(hash.slice(qIndex + 1));
    const oauth = params.get('youtube_oauth');
    if (!oauth) return;

    oauthHandledRef.current = true;

    const playlistId = params.get('id')?.trim() || selectedId;
    const reason = params.get('reason')?.trim();

    params.delete('youtube_oauth');
    params.delete('reason');
    const rest = params.toString();
    const newHash = rest
      ? `#/playlists?${rest}`
      : playlistId
        ? `#/playlists?id=${encodeURIComponent(playlistId)}`
        : '#/playlists';
    window.history.replaceState(null, '', newHash);

    if (oauth === 'connected' && playlistId) {
      setOauthJustConnected(true);
      setExportTarget({
        id: playlistId,
        title: detail?.playlist.id === playlistId ? detail.playlist.title : '',
        trackCount: detail?.playlist.id === playlistId ? detail.items.length : 0,
      });
      if (selectedId !== playlistId) {
        onSelectId(playlistId);
      }
    } else if (oauth === 'error') {
      setError(friendlyError(reason ?? 'youtube_oauth_failed', t));
    }
  }, [detail?.items.length, detail?.playlist.id, detail?.playlist.title, onSelectId, selectedId, t]);

  useEffect(() => {
    if (!exportTarget || !detail || detail.playlist.id !== exportTarget.id) return;
    if (
      exportTarget.title === detail.playlist.title
      && exportTarget.trackCount === detail.items.length
    ) {
      return;
    }
    setExportTarget({
      id: exportTarget.id,
      title: detail.playlist.title,
      trackCount: detail.items.length,
    });
  }, [detail, exportTarget]);

  useEffect(() => {
    if (playlists.length === 0) {
      setListSearchTargetId(undefined);
      return;
    }
    setListSearchTargetId((prev) => {
      if (prev && playlists.some((row) => row.id === prev)) return prev;
      const lastId = readLastPlaylistId();
      if (lastId && playlists.some((row) => row.id === lastId)) return lastId;
      return playlists[0]?.id;
    });
  }, [playlists]);

  useEffect(() => {
    if (!listSearchTargetId) {
      setListSearchExistingVideoIds(new Set());
      return;
    }
    let cancelled = false;
    void getPlaylist(listSearchTargetId)
      .then((data) => {
        if (!cancelled) {
          setListSearchExistingVideoIds(
            new Set(data.items.map((item) => item.youtubeVideoId)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setListSearchExistingVideoIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [listSearchTargetId]);

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
      writeLastPlaylistId(selectedId);
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

  const backToList = () => {
    onSelectId(undefined);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newListTitle.trim();
    if (!title || creatingList) return;

    setCreatingList(true);
    setError(null);
    setNotice(null);
    try {
      const data = await createPlaylist(title);
      setNewListTitle('');
      await loadList();
      onSelectId(data.playlist.id);
      setDetail(data);
      setActiveIndex(0);
      setPlaying(false);
      setPlayerEngaged(false);
      setNotice(t('playlists.createSuccess', { title: data.playlist.title }));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'create_playlist_failed', t));
    } finally {
      setCreatingList(false);
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
    if (selectedId === data.playlist.id) {
      setDetail(data);
    }
    if (listSearchTargetId === data.playlist.id) {
      setListSearchExistingVideoIds(
        new Set(data.items.map((item) => item.youtubeVideoId)),
      );
    }
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

  const engageAtIndex = (index: number, shouldPlay: boolean) => {
    if (shuffleEnabled && detail?.items.length) {
      if (shuffleOrder.length !== detail.items.length) {
        beginShuffleRound(detail.items.length, index);
      } else {
        syncShuffleCursorForIndex(index, shuffleOrder);
      }
    }
    setActiveIndex(index);
    setPlaying(shouldPlay);
    setPlayerEngaged(true);
  };

  const engageAndPlay = (index: number) => engageAtIndex(index, true);

  const openPlayerPaused = (index: number) => engageAtIndex(index, false);

  const startPlayback = () => {
    if (!detail?.items.length) return;
    if (shuffleEnabled) {
      const order = beginShuffleRound(detail.items.length);
      engageAndPlay(order[0]!);
      return;
    }
    engageAndPlay(0);
  };

  const openPlaybackPaused = () => {
    if (!detail?.items.length) return;
    if (shuffleEnabled) {
      const order = beginShuffleRound(detail.items.length);
      openPlayerPaused(order[0]!);
      return;
    }
    openPlayerPaused(0);
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
  const existingVideoIds = useMemo(
    () => new Set(detail?.items.map((item) => item.youtubeVideoId) ?? []),
    [detail?.items],
  );
  const showPlayer = playerEngaged && playerItems.length > 0;
  const youtubeWatchActive = showPlayer && playbackMode === 'video';
  const youtubeWatchMobile = youtubeWatchActive && isMobileViewport;
  const youtubeWatchDesktop = youtubeWatchActive && !isMobileViewport;
  const audioWatchActive = showPlayer && playbackMode === 'audio';
  const audioWatchDesktop = audioWatchActive && !isMobileViewport;
  const audioWatchMobile = audioWatchActive && isMobileViewport;
  const showMobileAudioDock =
    isMobileViewport &&
    Boolean(selectedId && detail?.items.length) &&
    playbackMode === 'audio' &&
    !youtubeWatchMobile;
  const mobileDockCanGoPrev = playerEngaged ? canGoPrev : activeIndex > 0;
  const mobileDockCanGoNext = playerEngaged ? canGoNext : itemCount > 1 || shuffleEnabled;

  const handleMobileDockPlayToggle = () => {
    if (!detail?.items.length) return;
    if (!playerEngaged) {
      startPlayback();
      return;
    }
    setPlaying((wasPlaying) => !wasPlaying);
  };

  const handleMobileDockPrev = () => {
    if (!detail?.items.length) return;
    if (!playerEngaged) {
      if (activeIndex > 0) engageAndPlay(activeIndex - 1);
      return;
    }
    goToPrevTrack();
  };

  const handleMobileDockNext = () => {
    if (!detail?.items.length) return;
    if (!playerEngaged) {
      if (shuffleEnabled) {
        const order = beginShuffleRound(detail.items.length);
        engageAndPlay(order[1] ?? order[0]!);
      } else if (detail.items.length > 1) {
        engageAndPlay(Math.min(activeIndex + 1, detail.items.length - 1));
      } else {
        startPlayback();
      }
      return;
    }
    goToNextTrack();
  };

  useEffect(() => {
    if (!audioWatchDesktop) setQueueOpen(false);
  }, [audioWatchDesktop]);

  useEffect(() => {
    if (!youtubeWatchMobile && !audioWatchMobile) return;
    document.body.classList.add(
      youtubeWatchMobile ? 'playlists-mobile-video-active' : 'playlists-mobile-audio-active',
    );
    return () => {
      document.body.classList.remove('playlists-mobile-video-active', 'playlists-mobile-audio-active');
    };
  }, [youtubeWatchMobile, audioWatchMobile]);

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
    if (!detail?.items.length) return;
    if (mode === 'audio') {
      if (!playerEngaged) {
        openPlaybackPaused();
      } else {
        setPlaying(false);
      }
      return;
    }
    if (mode === 'video' && playerEngaged) {
      setPlaying(true);
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

  const toggleTracksEditMode = () => {
    setTracksEditMode((open) => {
      if (open) {
        setTrackDragIndex(null);
        setTrackDragOver(null);
      }
      return !open;
    });
  };

  const renderTracksEditToggle = (className = 'btn-secondary') => (
    <button
      type="button"
      className={`${className} playlists-tracks-edit-btn${tracksEditMode ? ' active' : ''}`}
      aria-pressed={tracksEditMode}
      onClick={toggleTracksEditMode}
    >
      {tracksEditMode ? t('playlists.doneEditTracks') : t('playlists.editTracks')}
    </button>
  );

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

  const renderPlaybackModeToggle = (className = 'playlists-playback-mode') => (
    <div className={className} role="group" aria-label={t('playlists.playbackMode')}>
      <button
        type="button"
        className={`${className}-btn${playbackMode === 'audio' ? ' active' : ''}`}
        aria-pressed={playbackMode === 'audio'}
        onClick={() => onPlaybackModeChange('audio')}
      >
        {t('playlists.playbackMp3')}
      </button>
      <button
        type="button"
        className={`${className}-btn${playbackMode === 'video' ? ' active' : ''}`}
        aria-pressed={playbackMode === 'video'}
        onClick={() => onPlaybackModeChange('video')}
      >
        {t('playlists.playbackVideo')}
      </button>
    </div>
  );

  const renderAudioPlayer = (placement: 'inline' | 'dock') => {
    if (!showPlayer || playbackMode !== 'audio') return null;
    if (placement === 'dock' && !audioWatchDesktop) return null;
    if (placement === 'inline' && !audioWatchMobile) return null;

    return (
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
        playlistTitle={detail?.playlist.title}
        variant={audioWatchMobile ? 'mobileRecord' : 'desktopDock'}
        repeatMode={repeatMode}
        onCycleRepeat={cycleRepeat}
        onRepeatModeChange={changeRepeatMode}
        shuffleEnabled={shuffleEnabled}
        onToggleShuffle={toggleShuffle}
        onToggleQueue={() => setQueueOpen((open) => !open)}
        queueOpen={queueOpen}
        onProgressUpdate={setAudioProgress}
        progressHandleRef={audioProgressHandleRef}
      />
    );
  };

  const renderMainToolbar = (
    playlist: PlaylistDetail['playlist'],
    hasTracks: boolean,
  ) => (
    <>
      <header className="playlists-detail-header desktop-only">
        <div className="playlists-detail-actions">
          {hasTracks && (
            <>
              <button type="button" className="btn-primary playlists-play-all-btn" onClick={startPlayback}>
                {t('playlists.playAll')}
              </button>
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
            </>
          )}
          <button type="button" className="btn-secondary" onClick={() => setShowAddModal(true)}>
            {t('playlists.addTitle')}
          </button>
          {hasTracks && renderTracksEditToggle()}
          {permissions.canExportToYoutube && playbackMode === 'video' && hasTracks && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setExportTarget({
                  id: playlist.id,
                  title: playlist.title,
                  trackCount: detail?.items.length ?? playlist.itemCount ?? 0,
                })
              }
            >
              {t('playlists.exportYoutube')}
            </button>
          )}
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
          {permissions.canMerge && playlist.matchedCount > 0 && (
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
      </header>
    </>
  );

  const focusImportField = () => {
    closeMenu();
    setPlayerEngaged(false);
    setPlaying(false);
    onSelectId(undefined);
    window.requestAnimationFrame(() => {
      const input = document.getElementById('playlist-import-url');
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (input instanceof HTMLInputElement) input.focus();
    });
  };

  const renderPlaylistsMobileMenu = () => {
    if (!isMobileViewport) return null;

    if (!selectedId || !detail) {
      return (
        <div className="nav-mobile-menu-playlists-inner">
          <p className="nav-mobile-menu-playlists-title">{t('playlists.mobileMenuTitle')}</p>
          <button type="button" className="nav-mobile-menu-item btn-primary" onClick={focusImportField}>
            {t('playlists.importTitle')}
          </button>
        </div>
      );
    }

    const playlist = detail.playlist;
    const hasTracks = detail.items.length > 0;

    return (
      <div className="nav-mobile-menu-playlists-inner">
        <p className="nav-mobile-menu-playlists-title">{t('playlists.mobileMenuTitle')}</p>
        <button type="button" className="nav-mobile-menu-item btn-secondary" onClick={focusImportField}>
          {t('playlists.importTitle')}
        </button>
        <button
          type="button"
          className="nav-mobile-menu-item btn-primary"
          onClick={() => {
            setShowAddModal(true);
            closeMenu();
          }}
        >
          {t('playlists.searchSongs')}
        </button>
        {hasTracks && (
          <button
            type="button"
            className="nav-mobile-menu-item btn-secondary"
            onClick={() => {
              startPlayback();
              closeMenu();
            }}
          >
            {t('playlists.playAll')}
          </button>
        )}
        {hasTracks && (
          <>
            <button
              type="button"
              className={`nav-mobile-menu-item btn-secondary playlists-tracks-edit-btn${tracksEditMode ? ' active' : ''}`}
              aria-pressed={tracksEditMode}
              onClick={() => {
                toggleTracksEditMode();
                closeMenu();
              }}
            >
              {tracksEditMode ? t('playlists.doneEditTracks') : t('playlists.editTracks')}
            </button>
            <button
              type="button"
              className={`nav-mobile-menu-item btn-secondary playlists-shuffle-btn${shuffleEnabled ? ' active' : ''}`}
              aria-pressed={shuffleEnabled}
              onClick={() => {
                toggleShuffle();
                closeMenu();
              }}
            >
              {t('playlists.shuffle')}
            </button>
            <button
              type="button"
              className={`nav-mobile-menu-item btn-secondary playlists-repeat-btn${repeatMode !== 'off' ? ' active' : ''}`}
              onClick={() => {
                cycleRepeat();
                closeMenu();
              }}
            >
              {repeatMode === 'one'
                ? t('playlists.repeatOne')
                : repeatMode === 'all'
                  ? t('playlists.repeatAll')
                  : t('playlists.repeatOff')}
            </button>
          </>
        )}
        <button
          type="button"
          className="nav-mobile-menu-item btn-secondary"
          onClick={() => {
            setShareTarget({ id: playlist.id, title: playlist.title });
            closeMenu();
          }}
        >
          {t('playlists.share')}
        </button>
        {permissions.canExportToYoutube && playbackMode === 'video' && hasTracks && (
          <button
            type="button"
            className="nav-mobile-menu-item btn-secondary"
            onClick={() => {
              setExportTarget({
                id: playlist.id,
                title: playlist.title,
                trackCount: detail.items.length,
              });
              closeMenu();
            }}
          >
            {t('playlists.exportYoutube')}
          </button>
        )}
        {permissions.canMerge && playlist.matchedCount > 0 && (
          <button
            type="button"
            className="nav-mobile-menu-item btn-secondary"
            onClick={() => {
              onLoadToMerge(playlist.id);
              closeMenu();
            }}
          >
            {t('playlists.loadToMerge')}
          </button>
        )}
        <button
          type="button"
          className="nav-mobile-menu-item btn-secondary btn-danger-outline"
          disabled={deletingId === playlist.id}
          onClick={() => {
            setDeleteTarget({ id: playlist.id, title: playlist.title });
            closeMenu();
          }}
        >
          {deletingId === playlist.id ? t('playlists.deleting') : t('playlists.delete')}
        </button>
      </div>
    );
  };

  return (
    <>
      <PlaylistsMobileMenuPortal>{renderPlaylistsMobileMenu()}</PlaylistsMobileMenuPortal>
      <div className="page-body page-body-playlists">
      <main
        className="playlists-page"
        data-youtube-watch={youtubeWatchActive ? 'true' : 'false'}
        data-youtube-desktop-watch={youtubeWatchDesktop ? 'true' : 'false'}
        data-mobile-video-immersive={youtubeWatchMobile ? 'true' : 'false'}
        data-audio-now-playing={audioWatchActive ? 'true' : 'false'}
        data-audio-desktop-dock={audioWatchDesktop ? 'true' : 'false'}
        data-audio-mobile-record={audioWatchMobile ? 'true' : 'false'}
        data-mobile-audio-dock={showMobileAudioDock ? 'true' : 'false'}
      >
        <header className={`playlists-header${selectedId ? ' mobile-only-hidden' : ''}`}>
          <h1>{t('playlists.title')}</h1>
          <p className="playlists-intro">{t('playlists.intro')}</p>
        </header>

        {(error || notice) && !(isMobileViewport && !selectedId) && (
          <div className="playlists-alerts">
            {error && <p className="error-msg playlists-alert">{error}</p>}
            {notice && <p className="playlists-notice">{notice}</p>}
          </div>
        )}

        <div
          className="playlists-workspace"
          data-mobile-view={selectedId ? 'detail' : 'list'}
          data-player-active={showPlayer ? 'true' : 'false'}
          data-youtube-watch={youtubeWatchActive ? 'true' : 'false'}
          data-youtube-desktop-watch={youtubeWatchDesktop ? 'true' : 'false'}
          data-mobile-video-immersive={youtubeWatchMobile ? 'true' : 'false'}
          data-audio-now-playing={audioWatchActive ? 'true' : 'false'}
          data-audio-desktop-dock={audioWatchDesktop ? 'true' : 'false'}
          data-audio-mobile-record={audioWatchMobile ? 'true' : 'false'}
          data-playback-mode={playbackMode}
          data-mobile-audio-dock={showMobileAudioDock ? 'true' : 'false'}
        >
          <aside
            className={`playlists-sidebar${isMobileViewport && !selectedId ? ' playlists-sidebar--search-only' : ''}`}
            aria-label={
              isMobileViewport && !selectedId
                ? t('playlists.searchSection')
                : t('playlists.savedTitle')
            }
          >
            {isMobileViewport && !selectedId ? (
              listSearchTargetId ? (
                <PlaylistYoutubeSearchPanel
                  className="playlists-youtube-search--mobile-list"
                  playlistId={listSearchTargetId}
                  existingVideoIds={listSearchExistingVideoIds}
                  onAdded={(data, meta) => void handleItemsAdded(data, meta)}
                  mobileListOnly
                />
              ) : null
            ) : (
              <>
                <div className="playlists-sidebar-head">
                  <h2>{t('playlists.savedTitle')}</h2>
                  {!loadingList && playlists.length > 0 && (
                    <span className="playlists-sidebar-count">{playlists.length}</span>
                  )}
                </div>

                <div className="playlists-sidebar-list">
              <form
                className="playlists-create-inline"
                onSubmit={(e) => void handleCreateList(e)}
                aria-label={t('playlists.importTitle')}
              >
                <div className="playlists-create-row">
                  <input
                    id="playlist-create-title"
                    type="text"
                    className="playlists-text-input"
                    placeholder={t('playlists.createPlaceholder')}
                    value={newListTitle}
                    onChange={(e) => setNewListTitle(e.target.value)}
                    disabled={creatingList}
                    maxLength={200}
                    autoComplete="off"
                    aria-label={t('playlists.createPlaceholder')}
                  />
                  <button
                    type="submit"
                    className="btn-primary playlists-create-btn"
                    disabled={creatingList || !newListTitle.trim()}
                  >
                    {creatingList ? t('playlists.creating') : t('playlists.importButton')}
                  </button>
                </div>
              </form>

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
              </>
            )}
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
              <div
                className={`playlists-main-inner${youtubeWatchActive ? ' playlists-main-inner--youtube-watch' : ''}${youtubeWatchDesktop ? ' playlists-main-inner--desktop-video' : ''}${youtubeWatchMobile ? ' playlists-main-inner--mobile-video' : ''}${audioWatchMobile ? ' playlists-main-inner--mobile-audio' : ''}${audioWatchDesktop ? ' playlists-main-inner--desktop-audio' : ''}`}
              >
                {renderMainToolbar(detail.playlist, detail.items.length > 0)}

                <div className="playlists-mobile-watch-toolbar mobile-only">
                  <button
                    type="button"
                    className="btn-secondary playlists-mobile-back"
                    onClick={backToList}
                  >
                    {t('playlists.backToList')}
                  </button>
                  {detail.items.length > 0 && renderPlaybackModeToggle('playlists-mobile-watch-mode')}
                </div>

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
                    data-youtube-watch={youtubeWatchActive ? 'true' : 'false'}
                    data-youtube-desktop-watch={youtubeWatchDesktop ? 'true' : 'false'}
                    data-mobile-video-immersive={youtubeWatchMobile ? 'true' : 'false'}
                    data-mobile-video-tracks-open={youtubeWatchActive ? 'true' : 'false'}
                    data-audio-desktop-dock={audioWatchDesktop ? 'true' : 'false'}
                    data-audio-mobile-record={audioWatchMobile ? 'true' : 'false'}
                    data-tracks-edit={tracksEditMode ? 'true' : 'false'}
                  >
                    <div className="playlists-player-col">
                      {!showPlayer && currentItem && (
                        <button
                          type="button"
                          className="playlists-hero desktop-only"
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

                      {showPlayer && playbackMode === 'audio' && renderAudioPlayer('inline')}

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
                          mobileInline={youtubeWatchMobile}
                          nativeControls
                        />
                      )}

                      {showPlayer && currentItem && !youtubeWatchMobile && (
                        <div className="playlists-youtube-meta desktop-only">
                          <h2 className="playlists-youtube-meta-title" title={currentItem.title}>{currentItem.title}</h2>
                          <p className="playlists-youtube-meta-sub">{detail.playlist.title}</p>
                        </div>
                      )}
                    </div>

                    <aside
                      className={`playlists-tracks-col${audioWatchMobile || audioWatchDesktop ? ' playlists-tracks-col--hidden-audio-watch' : ''}`}
                      aria-label={t('playlists.tracksTitle')}
                    >
                      <div className="playlists-tracks-head">
                        <h3>
                          {youtubeWatchActive
                            ? t('playlists.mixLabel', { title: detail.playlist.title })
                            : t('playlists.tracksTitle')}
                        </h3>
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
                                if (!tracksEditMode || trackDragIndex === null || savingOrder) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                const rect = e.currentTarget.getBoundingClientRect();
                                const after = e.clientY > rect.top + rect.height / 2;
                                setTrackDragOver({ index, after });
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (!tracksEditMode || trackDragIndex === null || !trackDragOver) return;
                                void applyTrackReorder(trackDragIndex, trackDragOver);
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
                              {tracksEditMode && (
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
                              )}
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
                              {tracksEditMode && (
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
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </aside>

                    {audioWatchDesktop && currentItem && (
                      <PlaylistDesktopAudioCenter
                        videoId={currentItem.youtubeVideoId}
                        title={currentItem.title}
                        currentTime={audioProgress.currentTime}
                      />
                    )}

                    {youtubeWatchMobile && currentItem && (
                      <div className="playlists-youtube-meta playlists-mobile-video-meta mobile-only">
                        <h2 className="playlists-youtube-meta-title" title={currentItem.title}>{currentItem.title}</h2>
                        <p className="playlists-youtube-meta-sub">{detail.playlist.title}</p>
                      </div>
                    )}
                  </div>
                )}
                {audioWatchDesktop && renderAudioPlayer('dock')}
                {(audioWatchMobile || audioWatchDesktop) && detail && (
                  <PlaylistQueuePanel
                    open={queueOpen}
                    onClose={() => setQueueOpen(false)}
                    items={detail.items}
                    activeIndex={activeIndex}
                    playing={playing}
                    onSelectTrack={(index) => engageAndPlay(index)}
                    variant={audioWatchDesktop ? 'desktopDock' : 'mobile'}
                  />
                )}
              </div>
            ) : null}
          </section>
        </div>
      </main>

      {showAddModal && selectedId && (
        <AddPlaylistItemsModal
          playlistId={selectedId}
          existingVideoIds={existingVideoIds}
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

      {exportTarget && (
        <ExportYoutubePlaylistModal
          playlistId={exportTarget.id}
          playlistTitle={exportTarget.title || detail?.playlist.title || t('playlists.title')}
          trackCount={exportTarget.trackCount || detail?.items.length || 0}
          oauthJustConnected={oauthJustConnected}
          onClose={() => {
            setExportTarget(null);
            setOauthJustConnected(false);
          }}
          onExported={() => setNotice(t('playlists.exportYoutubeDone'))}
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

      {showMobileAudioDock && currentItem && detail && (
        <PlaylistsMobilePlaybackDock
          title={currentItem.title}
          trackLabel={t('playlists.trackCounter', {
            current: activeIndex + 1,
            total: detail.items.length,
          })}
          playing={playing && playerEngaged}
          canGoPrev={mobileDockCanGoPrev}
          canGoNext={mobileDockCanGoNext}
          showProgress={playerEngaged}
          currentTime={audioProgress.currentTime}
          duration={audioProgress.duration}
          canSeek={audioProgress.canSeek}
          onSeekRatio={(ratio) => audioProgressHandleRef.current?.seekToRatio(ratio)}
          shuffleEnabled={shuffleEnabled}
          queueOpen={queueOpen}
          onToggleShuffle={toggleShuffle}
          onToggleQueue={() => setQueueOpen((open) => !open)}
          onPlayToggle={handleMobileDockPlayToggle}
          onPrev={handleMobileDockPrev}
          onNext={handleMobileDockNext}
        />
      )}

    </div>
    </>
  );
}
