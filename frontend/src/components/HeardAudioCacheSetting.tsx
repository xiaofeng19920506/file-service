import { useEffect, useState } from 'react';
import { clearHeardAudioCache } from '../lib/heard-audio-cache';
import {
  HEARD_AUDIO_CACHE_PREF_EVENT,
  readHeardAudioCacheEnabled,
  writeHeardAudioCacheEnabled,
} from '../lib/heard-audio-cache-preference';
import { useI18n } from '../i18n';

export default function HeardAudioCacheSetting({ className }: { className?: string }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(readHeardAudioCacheEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readHeardAudioCacheEnabled());
    window.addEventListener(HEARD_AUDIO_CACHE_PREF_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(HEARD_AUDIO_CACHE_PREF_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const onToggle = (next: boolean) => {
    setEnabled(next);
    writeHeardAudioCacheEnabled(next);
    if (!next) {
      void clearHeardAudioCache();
    }
  };

  return (
    <div className={`app-setting-row${className ? ` ${className}` : ''}`}>
      <div className="app-setting-copy">
        <span className="app-setting-label" id="heard-audio-cache-label">
          {t('settings.heardAudioCache')}
        </span>
        <span className="app-setting-hint">{t('settings.heardAudioCacheHint')}</span>
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
