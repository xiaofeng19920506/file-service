import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchBulletinTemplateFile, getBulletin } from '../api/bulletins';
import { getPlaylist, type PlaylistDetail } from '../api/playlists';
import PlaylistAudioPlayer from '../components/PlaylistAudioPlayer';
import YoutubePlaylistPlayer from '../components/YoutubePlaylistPlayer';
import { usePlaylistPlaybackTransport } from '../hooks/usePlaylistPlaybackTransport';
import { useI18n } from '../i18n';
import { generateBulletinPptx } from '../lib/bulletin-pptx';
import { parsePptxSlidesDetailed, type EditableSlide } from '../lib/pptx-preview';
import type { WorshipLiveMode } from '../lib/worship-live-config';

const WORSHIP_SLIDE_FIRST = 7;

type WorshipLivePageProps = {
  playlistId: string;
  bulletinId?: string;
  mode: WorshipLiveMode;
};

function slideImageUrl(slide: EditableSlide): string | null {
  if (slide.imageUrls.length > 0) return slide.imageUrls[0] ?? null;
  const path = slide.imageMediaPaths[0];
  if (path && slide.imagePreviewUrls?.[path]) return slide.imagePreviewUrls[path]!;
  return null;
}

export default function WorshipLivePage({ playlistId, bulletinId, mode }: WorshipLivePageProps) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [slides, setSlides] = useState<EditableSlide[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [musicDockOpen, setMusicDockOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const itemCount = detail?.items.length ?? 0;
  const transport = usePlaylistPlaybackTransport({
    itemCount,
    shuffleEnabled: false,
    repeatMode: 'all',
  });
  const { setPlaying } = transport;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const playlist = await getPlaylist(playlistId);
        if (cancelled) return;
        setDetail(playlist);
        if (!playlist.items.length) {
          setError(t('worship.playlistEmpty'));
          return;
        }

        if (mode === 'ppt') {
          if (!bulletinId) {
            setError(t('worship.bulletinRequired'));
            return;
          }
          const bulletin = await getBulletin(bulletinId);
          const template = await fetchBulletinTemplateFile();
          const pptx = await generateBulletinPptx(template, bulletin);
          const parsed = await parsePptxSlidesDetailed(pptx, {
            sourceFile: `bulletin-${bulletin.serviceDate}.pptx`,
          });
          if (cancelled) return;
          setSlides(parsed);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playlistId, bulletinId, mode, t]);

  useEffect(() => {
    if (!loading && detail?.items.length) {
      setPlaying(true);
    }
  }, [loading, detail?.items.length, setPlaying]);

  const audioItems = useMemo(
    () =>
      detail?.items.map((item) => ({
        youtubeVideoId: item.youtubeVideoId,
        title: item.title,
        audio: item.audio,
      })) ?? [],
    [detail?.items],
  );

  const youtubeItems = useMemo(
    () =>
      detail?.items.map((item) => ({
        youtubeVideoId: item.youtubeVideoId,
        title: item.title,
      })) ?? [],
    [detail?.items],
  );

  const exitLive = useCallback(() => {
    window.location.hash = '#/worship';
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (mode !== 'ppt' || slides.length === 0) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setSlideIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setSlideIndex((i) => Math.max(0, i - 1));
      } else if (event.key === 'Escape') {
        exitLive();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exitLive, mode, slides.length]);

  const currentSlide = slides[slideIndex];
  const onWorshipSlide =
    currentSlide && currentSlide.index >= WORSHIP_SLIDE_FIRST && currentSlide.index <= 9;

  const jumpToWorshipSlides = () => {
    const idx = slides.findIndex((s) => s.index === WORSHIP_SLIDE_FIRST);
    if (idx >= 0) setSlideIndex(idx);
  };

  if (loading) {
    return (
      <div className="worship-live worship-live--loading">
        <p>{t('worship.liveLoading')}</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="worship-live worship-live--error">
        <p className="form-error">{error ?? t('worship.liveFailed')}</p>
        <button type="button" className="btn-secondary" onClick={exitLive}>
          {t('worship.backToSetup')}
        </button>
      </div>
    );
  }

  if (mode === 'youtube') {
    return (
      <div className="worship-live worship-live--youtube" data-worship-mode="youtube">
        <div className="worship-live-youtube-stage">
          <YoutubePlaylistPlayer
            items={youtubeItems}
            activeIndex={transport.activeIndex}
            onActiveIndexChange={transport.setActiveIndex}
            playing={transport.playing}
            onPlayingChange={transport.setPlaying}
            onNextTrack={transport.goToNextTrack}
            onPrevTrack={transport.goToPrevTrack}
            canGoNext={transport.canGoNext}
            canGoPrev={transport.canGoPrev}
            immersive
            lockLandscape
          />
        </div>
        <div className="worship-live-topbar">
          <button type="button" className="btn-secondary" onClick={exitLive}>
            {t('worship.exitLive')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="worship-live worship-live--ppt" data-worship-mode="ppt">
      <div className="worship-live-ppt-stage">
        {currentSlide ? (
          <>
            {slideImageUrl(currentSlide) ? (
              <img
                className="worship-live-slide-img"
                src={slideImageUrl(currentSlide)!}
                alt=""
              />
            ) : (
              <div className="worship-live-slide-fallback">
                {currentSlide.title && <h2>{currentSlide.title}</h2>}
                {currentSlide.textLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="worship-live-slide-fallback">{t('worship.noSlides')}</p>
        )}
      </div>

      <div className="worship-live-ppt-toolbar">
        <button
          type="button"
          className="worship-live-toolbar-btn"
          disabled={slideIndex <= 0}
          onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
          aria-label={t('preview.prevSlide')}
        >
          ‹
        </button>
        <span className="worship-live-slide-counter">
          {slides.length > 0
            ? t('preview.slideCounter', { current: slideIndex + 1, total: slides.length })
            : '—'}
        </span>
        <button
          type="button"
          className="worship-live-toolbar-btn"
          disabled={slideIndex >= slides.length - 1}
          onClick={() => setSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
          aria-label={t('preview.nextSlide')}
        >
          ›
        </button>
        <button type="button" className="btn-secondary" onClick={jumpToWorshipSlides}>
          {t('worship.jumpToWorshipSlides')}
        </button>
        <button
          type="button"
          className={`btn-secondary${musicDockOpen ? ' active' : ''}`}
          onClick={() => setMusicDockOpen((open) => !open)}
        >
          {musicDockOpen ? t('worship.hideMusic') : t('worship.showMusic')}
        </button>
        <button type="button" className="btn-secondary" onClick={exitLive}>
          {t('worship.exitLive')}
        </button>
      </div>

      {onWorshipSlide && (
        <p className="worship-live-worship-hint">{t('worship.worshipSlideHint')}</p>
      )}

      <div className={`worship-live-music-root${musicDockOpen ? ' is-open' : ''}`}>
        <PlaylistAudioPlayer
          items={audioItems}
          activeIndex={transport.activeIndex}
          onActiveIndexChange={transport.setActiveIndex}
          playing={transport.playing}
          onPlayingChange={transport.setPlaying}
          onNextTrack={transport.goToNextTrack}
          onPrevTrack={transport.goToPrevTrack}
          canGoNext={transport.canGoNext}
          canGoPrev={transport.canGoPrev}
          playlistTitle={detail.playlist.title}
          variant={musicDockOpen ? 'desktopDock' : 'default'}
          repeatMode="all"
        />
      </div>
    </div>
  );
}
