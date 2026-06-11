export const PLAYER_VOLUME_STORAGE_KEY = 'youtube-player-volume';

export function readStoredPlayerVolume(): number {
  try {
    const raw = localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY);
    if (raw === null) return 100;
    const value = Number(raw);
    if (!Number.isFinite(value)) return 100;
    return Math.min(100, Math.max(0, Math.round(value)));
  } catch {
    return 100;
  }
}

export function writeStoredPlayerVolume(value: number): void {
  try {
    localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(Math.min(100, Math.max(0, Math.round(value)))));
  } catch {
    /* ignore */
  }
}
