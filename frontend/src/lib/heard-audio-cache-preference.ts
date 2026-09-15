export const HEARD_AUDIO_CACHE_PREF_KEY = 'heard-audio-cache-enabled';
export const HEARD_AUDIO_CACHE_PREF_EVENT = 'heard-audio-cache-pref-change';

/** 默认开启：听过的歌曲缓存在本机设备 */
export function readHeardAudioCacheEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HEARD_AUDIO_CACHE_PREF_KEY);
    if (raw === null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

export function writeHeardAudioCacheEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HEARD_AUDIO_CACHE_PREF_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(HEARD_AUDIO_CACHE_PREF_EVENT, { detail: { enabled } }),
    );
  }
}
