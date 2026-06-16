import { useEffect, useMemo, useRef, useState } from 'react';
import VipVideoBrowse, { VipVideoSearchBar } from '../components/vip/VipVideoBrowse';
import { useAuth } from '../auth/AuthContext';
import { useDebouncedYoutubeSearch } from '../hooks/useDebouncedYoutubeSearch';
import { useVipVideoPlayback } from '../hooks/useVipVideoPlayback';
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
  const watchTopRef = useRef<HTMLDivElement>(null);
  const search = useDebouncedYoutubeSearch();
  const { current, status, streamUrl, errorCode, isReady, play } = useVipVideoPlayback();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!current) return;
    watchTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setPlaying(true);
    setCurrentTime(0);
    setDuration(0);
  }, [current?.videoId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !streamUrl) return;
    el.src = streamUrl;
    el.load();
    if (playing) {
      void el.play().catch(() => setPlaying(false));
    }
  }, [streamUrl, current?.videoId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing && isReady) {
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [playing, isReady]);

  const statusText = useMemo(() => {
    if (!current) return '';
    if (isReady) return '';
    if (status === 'failed') {
      return friendlyError(errorCode ?? 'video_extract_failed', t);
    }
    return t('vipVideo.caching', { title: current.title });
  }, [current, errorCode, isReady, status, t]);

  return (
    <div className="vip-video-page vip-video-page--clone">
      <header className="vip-video-topbar">
        <div className="vip-video-brand">
          <span className="vip-video-brand-mark" aria-hidden>
            ▶
          </span>
          <span className="vip-video-brand-name">{t('vipVideo.brand')}</span>
        </div>
        <div className="vip-video-topbar-search">
          <VipVideoSearchBar search={search} className="vip-video-search-box--topbar" />
        </div>
        <div className="vip-video-topbar-actions">
          {user && <span className="vip-video-user">{user.email}</span>}
          <button type="button" className="btn-secondary btn-sm" onClick={logout}>
            {t('auth.logout')}
          </button>
        </div>
      </header>

      <div className="vip-video-body">
        {current ? (
          <div ref={watchTopRef} className="vip-video-watch">
            <div className="vip-video-watch-main">
              <section className="vip-video-stage">
                {isReady ? (
                  <video
                    ref={videoRef}
                    className="vip-video-player"
                    playsInline
                    controls={false}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                    onEnded={() => setPlaying(false)}
                  />
                ) : (
                  <div className="vip-video-placeholder">
                    {current.thumbnailUrl && (
                      <img
                        className="vip-video-placeholder-thumb"
                        src={current.thumbnailUrl}
                        alt=""
                      />
                    )}
                    <div className="vip-video-placeholder-overlay">
                      <span className="youtube-search-loading-spinner" aria-hidden />
                      <p>{statusText || t('vipVideo.noStream')}</p>
                    </div>
                  </div>
                )}

                <div className="vip-video-watch-meta">
                  <h1 className="vip-video-watch-title">{current.title}</h1>
                  {current.channelTitle && (
                    <p className="vip-video-watch-channel">{current.channelTitle}</p>
                  )}
                </div>

                <div className="vip-video-controls">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!isReady}
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? t('vipVideo.pause') : t('vipVideo.play')}
                  </button>
                  <span className="vip-video-time">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
              </section>

              <aside className="vip-video-watch-sidebar">
                <VipVideoBrowse
                  variant="sidebar"
                  activeVideoId={current.videoId}
                  onPlay={play}
                  search={search}
                />
              </aside>
            </div>

            <div className="vip-video-watch-below">
              <VipVideoBrowse
                activeVideoId={current.videoId}
                onPlay={play}
                search={search}
                showSearch={false}
              />
            </div>
          </div>
        ) : (
          <VipVideoBrowse onPlay={play} search={search} showSearch={false} />
        )}
      </div>
    </div>
  );
}
