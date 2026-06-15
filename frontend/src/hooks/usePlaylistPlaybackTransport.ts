import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistRepeatMode } from '../lib/playlist-repeat-mode';
import {
  advanceShufflePlayback,
  buildShuffleOrder,
  buildShuffleOrderStartingWith,
  resolveShuffleCursor,
  retreatShufflePlayback,
} from '../lib/playlist-shuffle';

type UsePlaylistPlaybackTransportOptions = {
  itemCount: number;
  shuffleEnabled: boolean;
  repeatMode: PlaylistRepeatMode;
  initialIndex?: number;
};

export function usePlaylistPlaybackTransport({
  itemCount,
  shuffleEnabled,
  repeatMode,
  initialIndex = 0,
}: UsePlaylistPlaybackTransportOptions) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [shuffleCursor, setShuffleCursor] = useState(0);
  const shuffleOrderRef = useRef<number[]>([]);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const installShuffleOrder = useCallback((length: number, startIndex?: number) => {
    const order = buildShuffleOrderStartingWith(length, startIndex);
    shuffleOrderRef.current = order;
    setShuffleOrder(order);
    setShuffleCursor(0);
    return order;
  }, []);

  useEffect(() => {
    if (!shuffleEnabled || itemCount <= 0) {
      shuffleOrderRef.current = [];
      setShuffleOrder([]);
      setShuffleCursor(0);
      return;
    }
    installShuffleOrder(itemCount, activeIndexRef.current);
  }, [shuffleEnabled, itemCount, installShuffleOrder]);

  useEffect(() => {
    if (activeIndex >= itemCount && itemCount > 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, itemCount]);

  const goToNextTrack = useCallback(() => {
    if (itemCount <= 0) return;

    if (shuffleEnabled) {
      const order =
        shuffleOrderRef.current.length === itemCount
          ? shuffleOrderRef.current
          : installShuffleOrder(itemCount, activeIndex);
      const currentCursor = resolveShuffleCursor(order, activeIndex, shuffleCursor);
      const result = advanceShufflePlayback(
        order,
        activeIndex,
        currentCursor,
        itemCount,
        repeatMode,
        () => buildShuffleOrder(itemCount),
      );
      if (result.kind === 'track') {
        shuffleOrderRef.current = order;
        setShuffleOrder(order);
        setShuffleCursor(result.cursor);
        setActiveIndex(result.index);
        setPlaying(true);
      } else if (result.kind === 'reshuffle') {
        shuffleOrderRef.current = result.order;
        setShuffleOrder(result.order);
        setShuffleCursor(result.cursor);
        setActiveIndex(result.index);
        setPlaying(true);
      } else {
        setShuffleCursor(currentCursor);
        setPlaying(false);
      }
      return;
    }

    if (activeIndex < itemCount - 1) {
      setActiveIndex(activeIndex + 1);
      setPlaying(true);
    } else if (repeatMode === 'all') {
      setActiveIndex(0);
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }, [
    itemCount,
    shuffleEnabled,
    shuffleCursor,
    activeIndex,
    installShuffleOrder,
    repeatMode,
  ]);

  const goToPrevTrack = useCallback(() => {
    if (itemCount <= 0) return;

    if (shuffleEnabled) {
      const order =
        shuffleOrderRef.current.length === itemCount
          ? shuffleOrderRef.current
          : installShuffleOrder(itemCount, activeIndex);
      const step = retreatShufflePlayback(order, activeIndex, shuffleCursor);
      if (!step) return;
      shuffleOrderRef.current = order;
      setShuffleOrder(order);
      setShuffleCursor(step.cursor);
      setActiveIndex(step.index);
      setPlaying(true);
      return;
    }

    if (activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
      setPlaying(true);
    } else if (repeatMode === 'all') {
      setActiveIndex(itemCount - 1);
      setPlaying(true);
    }
  }, [itemCount, shuffleEnabled, shuffleCursor, activeIndex, installShuffleOrder, repeatMode]);

  const canGoNext =
    itemCount > 1 &&
    (shuffleEnabled
      ? true
      : activeIndex < itemCount - 1 || repeatMode === 'all');
  const canGoPrev =
    itemCount > 1 &&
    (shuffleEnabled ? shuffleOrder.length > 0 : activeIndex > 0 || repeatMode === 'all');

  return {
    activeIndex,
    setActiveIndex,
    playing,
    setPlaying,
    goToNextTrack,
    goToPrevTrack,
    canGoNext,
    canGoPrev,
    shuffleOrder,
  };
}
