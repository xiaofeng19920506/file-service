import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VipVideoBrowse, { VipVideoSearchBar } from '../components/vip/VipVideoBrowse';
import VipVideoControls from '../components/vip/VipVideoControls';
import { ChevronLeftIcon } from '../components/icons';
import { useAuth } from '../auth/AuthContext';
import { useDebouncedYoutubeSearch } from '../hooks/useDebouncedYoutubeSearch';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useVipVideoFullscreen } from '../hooks/useVipVideoFullscreen';
import { useVipVideoPlayback } from '../hooks/useVipVideoPlayback';
import { friendlyError } from '../lib/error-messages';
import { resolveVideoStreamSrc } from '../lib/resolve-stream-src';
import { resolveYoutubeThumbnailUrl } from '../lib/youtube-thumbnail';
import { requestVipVideoReextract } from '../api/vip-video';
import { useI18n } from '../i18n';

export default function VipVideoPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const videoRef = useRef<HTMLVideoElement>(null);
  const theaterRef = useRef<HTMLDivElement>(null);
  const watchTopRef = useRef<HTMLDivElement>(null);
  const search = useDebouncedYoutubeSearch({ debounceEnabled: false });
  const { current, status, streamUrl, errorCode, partial, durationSeconds, isReady, play, refreshForMoreCache, markPlaybackFailed, clear } =
    useVipVideoPlayback();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoDecodeIssue, setVideoDecodeIssue] = useState(false);
  const reextractAttemptedRef = useRef<string | null>(null);

  const { isFullscreen, toggleFullscreen, exitFullscreen } = useVipVideoFullscreen(
    theaterRef,
    videoRef,
  );

  const playbackDuration = useMemo(() => {
    if (Number.isFinite(duration) && duration > 0 && duration !== Infinity) {
      return duration;
    }
    if (typeof durationSeconds === 'number' && durationSeconds > 0) {
      return durationSeconds;
    }
    return 0;
  }, [duration, durationSeconds]);

  const syncDurationFromVideo = useCallback((el: HTMLVideoElement) => {
    const trackDuration = el.duration;
    if (Number.isFinite(trackDuration) && trackDuration > 0 && trackDuration !== Infinity) {
      setDuration(trackDuration);
    }
  }, []);

  const inspectVideoPlayback = useCallback(
    (el: HTMLVideoElement) => {
      syncDurationFromVideo(el);
      const noVideoTrack =
        el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && el.currentTime > 0.75
        && el.videoWidth === 0
        && el.videoHeight === 0;

      if (!noVideoTrack) {
        setVideoDecodeIssue(false);
        return;
      }

      setVideoDecodeIssue(true);
      if (!current?.videoId || reextractAttemptedRef.current === current.videoId) return;
      reextractAttemptedRef.current = current.videoId;
      void requestVipVideoReextract(current.videoId, current.title).catch(() => undefined);
    },
    [current?.videoId, current?.title, syncDurationFromVideo],
  );

  const posterSrc = current
    ? resolveYoutubeThumbnailUrl(current.videoId, current.thumbnailUrl)
    : undefined;

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
    setVideoDecodeIssue(false);
    reextractAttemptedRef.current = null;
  }, [current?.videoId, isMobile]);

  const stopPlayback = useCallback(() => {
    void exitFullscreen();
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setPlaying(false);
    clear();
  }, [exitFullscreen, clear]);

  const closePlayer = () => {
    stopPlayback();
  };

  const exitWatchForSearch = useCallback(() => {
    if (current) stopPlayback();
  }, [current, stopPlayback]);

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

  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, toggleFullscreen]);

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
              onBeforeSearch={exitWatchForSearch}
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
                <div
                  ref={theaterRef}
                  className={`vip-video-theater${isFullscreen ? ' vip-video-theater--fullscreen' : ''}`}
                >
                <div className="vip-video-player-wrap">
                  <video
                    ref={videoRef}
                    className="vip-video-player"
                    playsInline
                    preload={streamUrl ? 'auto' : 'none'}
                    poster={posterSrc}
                    onTimeUpdate={(e) => {
                      setCurrentTime(e.currentTarget.currentTime);
                      inspectVideoPlayback(e.currentTarget);
                    }}
                    onLoadedMetadata={(e) => inspectVideoPlayback(e.currentTarget)}
                    onDurationChange={(e) => inspectVideoPlayback(e.currentTarget)}
                    onLoadedData={(e) => inspectVideoPlayback(e.currentTarget)}
                    onCanPlay={(e) => inspectVideoPlayback(e.currentTarget)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                    onError={() => markPlaybackFailed()}
                    onWaiting={handleVideoWaiting}
                  />
                  {videoDecodeIssue && posterSrc && (
                    <img
                      className="vip-video-poster-fallback"
                      src={posterSrc}
                      alt=""
                      aria-hidden
                    />
                  )}
                  {videoDecodeIssue && (
                    <div
                      className="vip-video-placeholder-overlay vip-video-placeholder-overlay--player vip-video-placeholder-overlay--decode"
                      role="status"
                    >
                      <p className="vip-video-decode-hint">{t('vipVideo.reextractingVideo')}</p>
                    </div>
                  )}
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
                  duration={playbackDuration}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={() => void toggleFullscreen()}
                />
                </div>

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
