const STORAGE_KEY = 'playlist-last-open-id';

export function readLastPlaylistId(): string | null {
  try {
    const id = localStorage.getItem(STORAGE_KEY)?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export function writeLastPlaylistId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore quota / private mode
  }
}
