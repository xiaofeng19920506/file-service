export type PlaylistPlaybackMode = 'audio' | 'video';

const STORAGE_KEY = 'playlist-playback-mode';

export function readPlaylistPlaybackMode(): PlaylistPlaybackMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'audio' || raw === 'video') return raw;
  } catch {
    // ignore
  }
  return 'video';
}

export function writePlaylistPlaybackMode(mode: PlaylistPlaybackMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}
