import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchVipPlaylist,
  prioritizeVipVideos,
  type VipPlaylistItem,
} from '../api/vip-video';
import { useAuth } from '../auth/AuthContext';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VipVideoPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [items, setItems] = useState<VipPlaylistItem[]>([]);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const current = items[activeIndex] ?? null;
  const streamUrl = current?.video.streamUrl ?? null;
  const isReady = current?.video.status === 'ready' && Boolean(streamUrl);

  const loadPlaylist = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchVipPlaylist();
      setPlaylistTitle(data.playlist.title);
      setItems(data.items);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'vip_playlist_failed', t));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPlaylist();
  }, [loadPlaylist]);

  useEffect(() => {
    if (!items.length) return;
    const timer = window.setInterval(() => {
      void loadPlaylist();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [items.length, loadPlaylist]);

  useEffect(() => {
    if (!current || isReady) return;
    void prioritizeVipVideos([
      { videoId: current.youtubeVideoId, title: current.title },
      ...items
        .filter((_, i) => i !== activeIndex)
        .map((item) => ({ videoId: item.youtubeVideoId, title: item.title })),
    ]).catch(() => undefined);
  }, [activeIndex, current, isReady, items]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !streamUrl) return;
    el.src = streamUrl;
    el.load();
    if (playing) {
      void el.play().catch(() => setPlaying(false));
    }
  }, [streamUrl, activeIndex]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing && isReady) {
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [playing, isReady]);

  const goTrack = (index: number) => {
    if (index < 0 || index >= items.length) return;
    setActiveIndex(index);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(true);
  };

  const statusText = useMemo(() => {
    if (!current) return '';
    if (isReady) return '';
    if (current.video.status === 'failed') {
      return friendlyError(current.video.errorCode ?? 'video_extract_failed', t);
    }
    return t('vipVideo.caching', { title: current.title });
  }, [current, isReady, t]);

  if (loading) {
    return (
      <div className="vip-video-page vip-video-page--centered">
        <p>{t('vipVideo.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vip-video-page vip-video-page--centered">
        <p className="error-msg">{error}</p>
        <button type="button" className="btn-secondary" onClick={() => void loadPlaylist()}>
          {t('vipVideo.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="vip-video-page">
      <header className="vip-video-header">
        <div>
          <h1>{t('vipVideo.title')}</h1>
          <p className="vip-video-subtitle">{playlistTitle}</p>
        </div>
        <div className="vip-video-header-actions">
          {user && (
            <span className="vip-video-user">{user.email}</span>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={logout}>
            {t('auth.logout')}
          </button>
        </div>
      </header>

      <main className="vip-video-main">
        <section className="vip-video-stage">
          {isReady ? (
            <video
              ref={videoRef}
              className="vip-video-player"
              playsInline
              controls={false}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={() => {
                if (activeIndex < items.length - 1) {
                  goTrack(activeIndex + 1);
                } else {
                  setPlaying(false);
                }
              }}
            />
          ) : (
            <div className="vip-video-placeholder">
              <p>{statusText || t('vipVideo.noStream')}</p>
            </div>
          )}

          <div className="vip-video-controls">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={activeIndex <= 0}
              onClick={() => goTrack(activeIndex - 1)}
            >
              {t('vipVideo.prev')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!isReady}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? t('vipVideo.pause') : t('vipVideo.play')}
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={activeIndex >= items.length - 1}
              onClick={() => goTrack(activeIndex + 1)}
            >
              {t('vipVideo.next')}
            </button>
            <span className="vip-video-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {current && <p className="vip-video-now-playing">{current.title}</p>}
        </section>

        <aside className="vip-video-tracklist">
          <h2>{t('vipVideo.tracklist')}</h2>
          <ol>
            {items.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`vip-video-track${index === activeIndex ? ' active' : ''}`}
                  onClick={() => goTrack(index)}
                >
                  <span className="vip-video-track-title">{item.title}</span>
                  <span className="vip-video-track-meta">
                    {item.video.status === 'ready'
                      ? t('vipVideo.statusReady')
                      : item.video.status === 'failed'
                        ? t('vipVideo.statusFailed')
                        : t('vipVideo.statusCaching')}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </main>
    </div>
  );
}
