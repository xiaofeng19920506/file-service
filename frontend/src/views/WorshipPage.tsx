import { useCallback, useEffect, useState } from 'react';
import { listBulletins, type WeeklyBulletin } from '../api/bulletins';
import { getPlaylist, listPlaylists, type PlaylistSummary } from '../api/playlists';
import { useI18n } from '../i18n';
import {
  buildWorshipLiveHash,
  readWorshipLiveConfig,
  writeWorshipLiveConfig,
  type WorshipLiveMode,
} from '../lib/worship-live-config';

export default function WorshipPage() {
  const { t } = useI18n();
  const saved = readWorshipLiveConfig();

  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [bulletins, setBulletins] = useState<WeeklyBulletin[]>([]);
  const [mode, setMode] = useState<WorshipLiveMode>(saved?.mode ?? 'ppt');
  const [playlistId, setPlaylistId] = useState(saved?.playlistId ?? '');
  const [bulletinId, setBulletinId] = useState(saved?.bulletinId ?? '');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, weeks] = await Promise.all([listPlaylists(), listBulletins()]);
        if (cancelled) return;
        setPlaylists(list);
        setBulletins(weeks);
        setPlaylistId((prev) => prev || list[0]?.id || '');
        setBulletinId((prev) => prev || weeks[0]?.id || '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startLive = useCallback(async () => {
    if (!playlistId) {
      setError(t('worship.playlistRequired'));
      return;
    }
    if (mode === 'ppt' && !bulletinId) {
      setError(t('worship.bulletinRequired'));
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const detail = await getPlaylist(playlistId);
      if (!detail.items.length) {
        setError(t('worship.playlistEmpty'));
        return;
      }
      const config = { mode, playlistId, bulletinId: mode === 'ppt' ? bulletinId : undefined };
      writeWorshipLiveConfig(config);
      window.location.hash = buildWorshipLiveHash(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [bulletinId, mode, playlistId, t]);

  if (loading) {
    return <p className="worship-loading">{t('worship.loading')}</p>;
  }

  return (
    <div className="worship-page">
      <header className="worship-header">
        <h1>{t('worship.title')}</h1>
        <p className="worship-intro">{t('worship.intro')}</p>
      </header>

      {error && <p className="form-error">{error}</p>}

      <section className="worship-setup-card">
        <fieldset className="worship-fieldset">
          <legend>{t('worship.modeLegend')}</legend>
          <label className="worship-mode-option">
            <input
              type="radio"
              name="worship-mode"
              checked={mode === 'youtube'}
              onChange={() => setMode('youtube')}
            />
            <span>
              <strong>{t('worship.modeYoutubeTitle')}</strong>
              <small>{t('worship.modeYoutubeHint')}</small>
            </span>
          </label>
          <label className="worship-mode-option">
            <input
              type="radio"
              name="worship-mode"
              checked={mode === 'ppt'}
              onChange={() => setMode('ppt')}
            />
            <span>
              <strong>{t('worship.modePptTitle')}</strong>
              <small>{t('worship.modePptHint')}</small>
            </span>
          </label>
        </fieldset>

        <label className="worship-field">
          {t('worship.playlistLabel')}
          <select value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
            <option value="">{t('worship.playlistPlaceholder')}</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.itemCount})
              </option>
            ))}
          </select>
        </label>

        {mode === 'ppt' && (
          <label className="worship-field">
            {t('worship.bulletinLabel')}
            <select value={bulletinId} onChange={(e) => setBulletinId(e.target.value)}>
              <option value="">{t('worship.bulletinPlaceholder')}</option>
              {bulletins.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.serviceDate}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className="btn-primary worship-start-btn"
          disabled={starting}
          onClick={() => void startLive()}
        >
          {starting ? t('worship.starting') : t('worship.start')}
        </button>
      </section>
    </div>
  );
}
