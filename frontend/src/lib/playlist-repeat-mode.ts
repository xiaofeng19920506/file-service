export type PlaylistRepeatMode = 'off' | 'all' | 'one';

const STORAGE_KEY = 'playlist-repeat-mode';

export function readPlaylistRepeatMode(): PlaylistRepeatMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'all' || raw === 'one' || raw === 'off') return raw;
  } catch {
    // ignore
  }
  return 'off';
}

export function writePlaylistRepeatMode(mode: PlaylistRepeatMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function cyclePlaylistRepeatMode(current: PlaylistRepeatMode): PlaylistRepeatMode {
  if (current === 'off') return 'all';
  if (current === 'all') return 'one';
  return 'off';
}
