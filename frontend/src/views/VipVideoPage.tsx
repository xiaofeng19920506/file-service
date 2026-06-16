import { useEffect, useMemo, useRef, useState } from 'react';
import VipVideoBrowse, { VipVideoSearchBar } from '../components/vip/VipVideoBrowse';
import VipVideoControls from '../components/vip/VipVideoControls';
import { ChevronLeftIcon } from '../components/icons';
import { useAuth } from '../auth/AuthContext';
import { useDebouncedYoutubeSearch } from '../hooks/useDebouncedYoutubeSearch';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useVipVideoPlayback } from '../hooks/useVipVideoPlayback';
import { friendlyError } from '../lib/error-messages';
import { resolveVideoStreamSrc } from '../lib/resolve-stream-src';
import { useI18n } from '../i18n';

export default function VipVideoPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const videoRef = useRef<HTMLVideoElement>(null);
  const watchTopRef = useRef<HTMLDivElement>(null);
  const search = useDebouncedYoutubeSearch({ debounceEnabled: !isMobile });
  const { current, status, streamUrl, errorCode, partial, isReady, play, refreshForMoreCache, markPlaybackFailed, clear } =
    useVipVideoPlayback();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!current) return;
    if (isMobile) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      watchTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setPlaying(true);
    setCurrentTime(0);
    setDuration(0);
  }, [current?.videoId, isMobile]);

  const closePlayer = () => {
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setPlaying(false);
    clear();
  };

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !streamUrl) return;
    el.src = resolveVideoStreamSrc(streamUrl);
    el.load();
    if (playing) {
      void el.play().catch(() => setPlaying(false));
    }
  }, [streamUrl, current?.videoId, playing]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing && isReady) {
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [playing, isReady]);

  const errorText = useMemo(() => {
    if (!current || isReady || status !== 'failed') return '';
    return friendlyError(errorCode ?? 'video_extract_failed', t);
  }, [current, errorCode, isReady, status, t]);

  const isLoading = Boolean(current) && !isReady && status !== 'failed';

  const handleVideoWaiting = () => {
    if (!partial || !streamUrl) return;
    void refreshForMoreCache().then((data) => {
      if (!data || (data.cachedBytes ?? 0) <= 0) return;
      const el = videoRef.current;
      if (!el) return;
      const t = el.currentTime;
      el.src = resolveVideoStreamSrc(streamUrl);
      el.load();
      el.currentTime = t;
      if (playing) void el.play().catch(() => setPlaying(false));
    });
  };

  return (
    <div
      className={`vip-video-page vip-video-page--clone${isMobile ? ' vip-video-page--mobile' : ''}${current ? ' vip-video-page--watching' : ''}`}
    >
      <header
        className={`vip-video-topbar${current && isMobile ? ' vip-video-topbar--watching' : ''}`}
      >
        {current && isMobile ? (
          <div className="vip-video-topbar-start">
            <button
              type="button"
              className="vip-video-back-btn"
              onClick={closePlayer}
              aria-label={t('vipVideo.backToBrowse')}
            >
              <ChevronLeftIcon />
            </button>
            <div className="vip-video-brand vip-video-brand--compact">
              <span className="vip-video-brand-mark" aria-hidden>
                ▶
              </span>
              <span className="vip-video-brand-name">{t('vipVideo.brand')}</span>
            </div>
          </div>
        ) : (
          <div className="vip-video-brand">
            <span className="vip-video-brand-mark" aria-hidden>
              ▶
            </span>
            <span className="vip-video-brand-name">{t('vipVideo.brand')}</span>
          </div>
        )}
        {!(current && isMobile) && (
          <div className="vip-video-topbar-search">
            <VipVideoSearchBar
              search={search}
              isMobile={isMobile}
              className="vip-video-search-box--topbar"
            />
          </div>
        )}
        <div className="vip-video-topbar-actions">
          {user && !isMobile && <span className="vip-video-user">{user.email}</span>}
          <button type="button" className="btn-secondary btn-sm" onClick={logout}>
            {t('auth.logout')}
          </button>
        </div>
      </header>

      {current && isMobile && (
        <div className="vip-video-mobile-watch-title" title={current.title}>
          {current.title}
        </div>
      )}

      <div className="vip-video-body">
        {current ? (
          <div ref={watchTopRef} className="vip-video-watch">
            <div className="vip-video-watch-main">
              <section className="vip-video-stage">
                <div className="vip-video-player-wrap">
                  <video
                    ref={videoRef}
                    className="vip-video-player"
                    playsInline
                    preload={streamUrl ? 'auto' : 'none'}
                    poster={current.thumbnailUrl ?? undefined}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    onError={() => markPlaybackFailed()}
                    onWaiting={handleVideoWaiting}
                  />
                  {isLoading && (
                    <div
                      className="vip-video-placeholder-overlay vip-video-placeholder-overlay--player"
                      role="status"
                      aria-busy
                      aria-label={t('vipVideo.loading')}
                    >
                      <span className="vip-video-loading-spinner" aria-hidden />
                    </div>
                  )}
                  {status === 'failed' && !isReady && (
                    <div className="vip-video-placeholder-overlay vip-video-placeholder-overlay--player">
                      <p className="vip-video-placeholder-error">{errorText}</p>
                    </div>
                  )}
                </div>

                <VipVideoControls
                  videoRef={videoRef}
                  isReady={isReady}
                  isLoading={isLoading}
                  playing={playing}
                  onPlayingChange={setPlaying}
                  currentTime={currentTime}
                  duration={duration}
                  isMobile={isMobile}
                />

                {!isMobile && (
                  <div className="vip-video-watch-meta">
                    <h1 className="vip-video-watch-title">{current.title}</h1>
                    {current.channelTitle && (
                      <p className="vip-video-watch-channel">{current.channelTitle}</p>
                    )}
                  </div>
                )}

                {isMobile && current.channelTitle && (
                  <div className="vip-video-watch-meta vip-video-watch-meta--mobile">
                    <p className="vip-video-watch-channel">{current.channelTitle}</p>
                  </div>
                )}
              </section>

              {!isMobile && (
                <aside className="vip-video-watch-sidebar">
                  <VipVideoBrowse
                    variant="sidebar"
                    activeVideoId={current.videoId}
                    onPlay={play}
                    search={search}
                    isMobile={isMobile}
                  />
                </aside>
              )}
            </div>

            {isMobile && (
              <div className="vip-video-watch-below vip-video-watch-below--mobile">
                <h2 className="vip-video-browse-heading">{t('vipVideo.upNext')}</h2>
                <VipVideoBrowse
                  activeVideoId={current.videoId}
                  onPlay={play}
                  search={search}
                  showSearch={false}
                  isMobile={isMobile}
                  listStyle="row"
                />
              </div>
            )}
          </div>
        ) : (
          <VipVideoBrowse
            onPlay={play}
            search={search}
            showSearch={false}
            isMobile={isMobile}
            listStyle="grid"
          />
        )}
      </div>
    </div>
  );
}
