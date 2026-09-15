import { useEffect, useState } from 'react';
import {
  clearHeardAudioCache,
  getHeardAudioDiskStats,
  HEARD_AUDIO_DISK_EVENT,
} from '../lib/heard-audio-cache';
import {
  HEARD_AUDIO_CACHE_PREF_EVENT,
  readHeardAudioCacheEnabled,
  writeHeardAudioCacheEnabled,
} from '../lib/heard-audio-cache-preference';
import {
  registerHeardAudioServiceWorker,
  unregisterHeardAudioServiceWorker,
} from '../lib/heard-audio-sw-register';
import { useI18n } from '../i18n';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export default function HeardAudioCacheSetting({ className }: { className?: string }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(readHeardAudioCacheEnabled);
  const [stats, setStats] = useState(getHeardAudioDiskStats);

  useEffect(() => {
    const syncPref = () => setEnabled(readHeardAudioCacheEnabled());
    const syncDisk = () => setStats(getHeardAudioDiskStats());
    window.addEventListener(HEARD_AUDIO_CACHE_PREF_EVENT, syncPref);
    window.addEventListener(HEARD_AUDIO_DISK_EVENT, syncDisk);
    window.addEventListener('storage', syncPref);
    window.addEventListener('storage', syncDisk);
    return () => {
      window.removeEventListener(HEARD_AUDIO_CACHE_PREF_EVENT, syncPref);
      window.removeEventListener(HEARD_AUDIO_DISK_EVENT, syncDisk);
      window.removeEventListener('storage', syncPref);
      window.removeEventListener('storage', syncDisk);
    };
  }, []);

  const onToggle = (next: boolean) => {
    setEnabled(next);
    writeHeardAudioCacheEnabled(next);
    if (next) {
      void registerHeardAudioServiceWorker();
    } else {
      void clearHeardAudioCache().then(() => setStats(getHeardAudioDiskStats()));
      void unregisterHeardAudioServiceWorker();
    }
  };

  return (
    <div className={`app-setting-row${className ? ` ${className}` : ''}`}>
      <div className="app-setting-copy">
        <span className="app-setting-label" id="heard-audio-cache-label">
          {t('settings.heardAudioCache')}
        </span>
        <span className="app-setting-hint">{t('settings.heardAudioCacheHint')}</span>
        {enabled && stats.count > 0 ? (
          <span className="app-setting-meta">
            {t('settings.heardAudioCacheStats', {
              count: stats.count,
              size: formatBytes(stats.bytes),
            })}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className={`app-setting-switch${enabled ? ' is-on' : ''}`}
        role="switch"
        aria-checked={enabled}
        aria-labelledby="heard-audio-cache-label"
        onClick={() => onToggle(!enabled)}
      >
        <span className="app-setting-switch-thumb" />
      </button>
    </div>
  );
}
