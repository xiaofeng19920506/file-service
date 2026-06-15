import {
  readPlaylistRepeatMode,
  writePlaylistRepeatMode,
  type PlaylistRepeatMode,
} from './playlist-repeat-mode';
import {
  readPlaylistShuffleEnabled,
  writePlaylistShuffleEnabled,
} from './playlist-shuffle';

/** 列表播放顺序：单曲循环 / 列表循环 / 随机 / 顺序播完暂停 */
export type PlaylistPlaybackOrderMode =
  | 'sequential'
  | 'loop_all'
  | 'loop_one'
  | 'shuffle';

const STORAGE_KEY = 'playlist-playback-order-mode';

export function playbackOrderToRepeatShuffle(mode: PlaylistPlaybackOrderMode): {
  repeatMode: PlaylistRepeatMode;
  shuffleEnabled: boolean;
} {
  switch (mode) {
    case 'loop_one':
      return { repeatMode: 'one', shuffleEnabled: false };
    case 'loop_all':
      return { repeatMode: 'all', shuffleEnabled: false };
    case 'shuffle':
      return { repeatMode: 'off', shuffleEnabled: true };
    default:
      return { repeatMode: 'off', shuffleEnabled: false };
  }
}

export function repeatShuffleToPlaybackOrder(
  repeatMode: PlaylistRepeatMode,
  shuffleEnabled: boolean,
): PlaylistPlaybackOrderMode {
  if (shuffleEnabled) return 'shuffle';
  if (repeatMode === 'one') return 'loop_one';
  if (repeatMode === 'all') return 'loop_all';
  return 'sequential';
}

export function readPlaylistPlaybackOrderMode(): PlaylistPlaybackOrderMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (
      raw === 'sequential' ||
      raw === 'loop_all' ||
      raw === 'loop_one' ||
      raw === 'shuffle'
    ) {
      return raw;
    }
  } catch {
    // ignore
  }
  return repeatShuffleToPlaybackOrder(
    readPlaylistRepeatMode(),
    readPlaylistShuffleEnabled(),
  );
}

export function writePlaylistPlaybackOrderMode(mode: PlaylistPlaybackOrderMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  const { repeatMode, shuffleEnabled } = playbackOrderToRepeatShuffle(mode);
  writePlaylistRepeatMode(repeatMode);
  writePlaylistShuffleEnabled(shuffleEnabled);
}
