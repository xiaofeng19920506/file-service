import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getBulletin } from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import PlaylistAudioPlayer from '../PlaylistAudioPlayer';
import YoutubePlaylistPlayer, { type YoutubePlayerItem } from '../YoutubePlaylistPlayer';
import { useI18n } from '../../i18n';
import { rebuildBulletinSlides } from '../../lib/bulletin-slides';
import type { EditableSlide } from '../../lib/pptx-preview';
import type { WorshipLiveMode } from '../../lib/worship-live-config';

type Transport = {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  goToNextTrack: () => void;
  goToPrevTrack: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
};

type BulletinWorshipMaximizeOverlayProps = {
  mode: WorshipLiveMode;
  onModeChange: (mode: WorshipLiveMode) => void;
  onClose: () => void;
  bulletinId: string;
  playlistId: string;
  playlistTitle: string;
  items: PlaylistItem[];
  transport: Transport;
};

function toYoutubeItems(items: PlaylistItem[]): YoutubePlayerItem[] {
  return items
    .filter((item) => item.youtubeVideoId)
    .map((item) => ({ youtubeVideoId: item.youtubeVideoId, title: item.title }));
}

function slideImageUrl(slide: EditableSlide): string | null {
  if (slide.imageUrls.length > 0) return slide.imageUrls[0] ?? null;
  const path = slide.imageMediaPaths[0];
  if (path && slide.imagePreviewUrls?.[path]) return slide.imagePreviewUrls[path]!;
  return null;
}

export default function BulletinWorshipMaximizeOverlay({
  mode,
  onModeChange,
  onClose,
  bulletinId,
  playlistTitle,
  items,
  transport,
}: BulletinWorshipMaximizeOverlayProps) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const [slides, setSlides] = useState<EditableSlide[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slidesLoading, setSlidesLoading] = useState(mode === 'ppt');
  const [slidesError, setSlidesError] = useState<string | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);

  const youtubeItems = useMemo(() => toYoutubeItems(items), [items]);
  const audioItems = useMemo(
    () =>
      items.map((item) => ({
        youtubeVideoId: item.youtubeVideoId,
        title: item.title,
        audio: item.audio,
      })),
    [items],
  );

  useEffect(() => {
    if (mode !== 'ppt') return;
    let cancelled = false;
    setSlidesLoading(true);
    setSlidesError(null);
    void getBulletin(bulletinId)
      .then((bulletin) => rebuildBulletinSlides(bulletin))
      .then((parsed) => {
        if (!cancelled) {
          setSlides(parsed);
          const worshipIdx = parsed.findIndex((s) => s.index === 7);
          setSlideIndex(worshipIdx >= 0 ? worshipIdx : 0);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSlidesError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setSlidesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bulletinId, mode]);

  const { setPlaying } = transport;

  useEffect(() => {
    if (mode === 'ppt' && items.length > 0) {
      setPlaying(true);
    }
  }, [mode, items.length, setPlaying]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (mode !== 'ppt' || slides.length === 0) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setSlideIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setSlideIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, onClose, slides.length]);

  const toggleStageFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    const doc = document as Document & { webkitFullscreenElement?: Element };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const request =
      el.requestFullscreen ??
      (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
    if (request) await request.call(el);
  }, []);

  const currentSlide = slides[slideIndex];

  return createPortal(
    <div className="bulletin-worship-maximize" role="dialog" aria-modal="true">
      <header className="bulletin-worship-maximize-topbar">
        <div className="bulletin-worship-maximize-modes" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'youtube'}
            className={`bulletin-worship-maximize-mode${mode === 'youtube' ? ' is-active' : ''}`}
            onClick={() => onModeChange('youtube')}
          >
            {t('bulletin.worshipSlideModeVideo')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'ppt'}
            className={`bulletin-worship-maximize-mode${mode === 'ppt' ? ' is-active' : ''}`}
            onClick={() => onModeChange('ppt')}
          >
            {t('bulletin.worshipSlideModePpt')}
          </button>
        </div>
        <div className="bulletin-worship-maximize-topbar-actions">
          {mode === 'ppt' && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => void toggleStageFullscreen()}>
              {t('worship.projectFullscreen')}
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('bulletin.worshipSlideExitMaximize')}
          </button>
        </div>
      </header>

      {mode === 'youtube' ? (
        <div className="bulletin-worship-maximize-youtube">
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
      ) : (
        <div className="bulletin-worship-maximize-ppt">
          <div ref={stageRef} className="bulletin-worship-maximize-ppt-stage">
            {slidesLoading ? (
              <p className="bulletin-worship-maximize-muted">{t('worship.liveLoading')}</p>
            ) : slidesError ? (
              <p className="error-msg">{slidesError}</p>
            ) : currentSlide ? (
              slideImageUrl(currentSlide) ? (
                <img className="worship-live-slide-img" src={slideImageUrl(currentSlide)!} alt="" />
              ) : (
                <div className="worship-live-slide-fallback">
                  {currentSlide.title && <h2>{currentSlide.title}</h2>}
                  {currentSlide.textLines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )
            ) : (
              <p className="bulletin-worship-maximize-muted">{t('worship.noSlides')}</p>
            )}
          </div>

          <div className="bulletin-worship-maximize-ppt-toolbar">
            <button
              type="button"
              className="worship-live-toolbar-btn"
              disabled={slideIndex <= 0}
              onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
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
            >
              ›
            </button>
            <button
              type="button"
              className={`btn-secondary btn-sm${musicOpen ? ' active' : ''}`}
              onClick={() => setMusicOpen((open) => !open)}
            >
              {musicOpen ? t('worship.hideMusic') : t('worship.showMusic')}
            </button>
          </div>

          <p className="bulletin-worship-maximize-ppt-hint">{t('worship.worshipSlideHint')}</p>

          <div className={`bulletin-worship-maximize-music${musicOpen ? ' is-open' : ''}`}>
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
              playlistTitle={playlistTitle}
              variant={musicOpen ? 'desktopDock' : 'default'}
              repeatMode="all"
            />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
