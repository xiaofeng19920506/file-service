export type WorshipLiveMode = 'youtube' | 'ppt';

export type WorshipLiveConfig = {
  mode: WorshipLiveMode;
  playlistId: string;
  bulletinId?: string;
};

const STORAGE_KEY = 'worship-live-config';

export function readWorshipLiveConfig(): WorshipLiveConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as WorshipLiveConfig;
    if (!data.playlistId || (data.mode !== 'youtube' && data.mode !== 'ppt')) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeWorshipLiveConfig(config: WorshipLiveConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function buildWorshipLiveHash(config: WorshipLiveConfig): string {
  const params = new URLSearchParams();
  params.set('playlist', config.playlistId);
  params.set('mode', config.mode);
  if (config.mode === 'ppt' && config.bulletinId) {
    params.set('bulletin', config.bulletinId);
  }
  return `#/worship/live?${params.toString()}`;
}
