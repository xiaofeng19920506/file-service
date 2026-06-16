import { useEffect } from 'react';
import { useI18n } from '../i18n';
import { useBulletinSlideShow } from '../hooks/useBulletinSlideShow';
import { readSlideShowSession, removeSlideShowSession } from '../lib/bulletin-slideshow-session';
import { createSlideShowBus } from '../lib/bulletin-slideshow-bus';

type BulletinSlideShowPresenterPageProps = {
  sessionId: string;
};

function SlideThumb({
  slideNumber,
  url,
  loading,
  failed,
  label,
  emptyLabel,
}: {
  slideNumber: number;
  url?: string;
  loading: boolean;
  failed: boolean;
  label: string;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  return (
    <figure className="bulletin-slideshow-presenter-thumb">
      <figcaption>{label}</figcaption>
      <div className="bulletin-slideshow-presenter-thumb-frame">
        {loading && (
          <div className="bulletin-slideshow-presenter-thumb-loading">
            <div className="preview-spinner" />
          </div>
        )}
        {!loading && failed && <p className="bulletin-slideshow-presenter-thumb-empty">{emptyLabel}</p>}
        {!loading && !failed && url && (
          <img src={url} alt="" draggable={false} className="bulletin-slideshow-presenter-thumb-img" />
        )}
        {!loading && !failed && !url && (
          <p className="bulletin-slideshow-presenter-thumb-empty">
            {t('bulletin.previewSlideSingle', { page: slideNumber })}
          </p>
        )}
      </div>
    </figure>
  );
}

export default function BulletinSlideShowPresenterPage({ sessionId }: BulletinSlideShowPresenterPageProps) {
  const { t } = useI18n();
  const session = readSlideShowSession(sessionId);

  const show = useBulletinSlideShow({
    sessionId,
    role: 'presenter',
    patch: session?.patch ?? {},
    initialSlide: session?.initialSlide ?? 1,
    initialTotalSlides: session?.totalSlides,
  });

  useEffect(() => {
    document.documentElement.classList.add('bulletin-slideshow-window');
    document.body.classList.add('bulletin-slideshow-window');
    return () => {
      document.documentElement.classList.remove('bulletin-slideshow-window');
      document.body.classList.remove('bulletin-slideshow-window');
      removeSlideShowSession(sessionId);
    };
  }, [sessionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        show.goNext();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        show.goPrev();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        show.endShow();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        show.requestProjectorFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show]);

  useEffect(() => {
    const onBeforeUnload = () => {
      const bus = createSlideShowBus(sessionId);
      bus.publish({ type: 'close', from: 'presenter' });
      bus.close();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sessionId]);

  if (!session) {
    return (
      <div className="bulletin-slideshow-presenter bulletin-slideshow-presenter--empty">
        <p>{t('bulletin.slideShowSessionExpired')}</p>
      </div>
    );
  }

  const nextSlide = show.nextSlide;
  const currentLoading = show.loadingSlides.has(show.currentSlide);
  const currentFailed = show.failedSlides.has(show.currentSlide);
  const nextLoading = nextSlide ? show.loadingSlides.has(nextSlide) : false;
  const nextFailed = nextSlide ? show.failedSlides.has(nextSlide) : false;

  return (
    <div className="bulletin-slideshow-presenter">
      <header className="bulletin-slideshow-presenter-header">
        <h1>{t('bulletin.slideShowPresenterTitle')}</h1>
        <p>{t('bulletin.slideShowPresenterHint')}</p>
      </header>

      <div className="bulletin-slideshow-presenter-main">
        <SlideThumb
          slideNumber={show.currentSlide}
          url={show.slideUrls[show.currentSlide]}
          loading={currentLoading}
          failed={currentFailed}
          label={t('bulletin.slideShowCurrent')}
          emptyLabel={t('bulletin.previewUnavailableHint')}
        />
        <SlideThumb
          slideNumber={nextSlide ?? show.currentSlide}
          url={nextSlide ? show.slideUrls[nextSlide] : undefined}
          loading={Boolean(nextSlide && nextLoading)}
          failed={Boolean(nextSlide && nextFailed)}
          label={t('bulletin.slideShowNext')}
          emptyLabel={nextSlide ? t('bulletin.previewUnavailableHint') : t('bulletin.slideShowNoNext')}
        />
      </div>

      <div className="bulletin-slideshow-presenter-controls">
        <button
          type="button"
          className="bulletin-slideshow-nav"
          disabled={show.currentSlide <= 1}
          onClick={show.goPrev}
          aria-label={t('bulletin.previewPrev')}
        >
          ‹
        </button>
        <span className="bulletin-slideshow-counter">
          {t('preview.slideCounter', { current: show.currentSlide, total: show.totalSlides })}
        </span>
        <button
          type="button"
          className="bulletin-slideshow-nav"
          disabled={show.currentSlide >= show.totalSlides}
          onClick={show.goNext}
          aria-label={t('bulletin.previewNext')}
        >
          ›
        </button>
      </div>

      <div className="bulletin-slideshow-presenter-actions">
        <button type="button" className="btn-primary" onClick={show.requestProjectorFullscreen}>
          {t('bulletin.slideShowProjectorFullscreen')}
        </button>
        <button type="button" className="btn-secondary" onClick={show.endShow}>
          {t('bulletin.slideShowExit')}
        </button>
      </div>

      <p className="bulletin-slideshow-presenter-shortcuts">{t('bulletin.slideShowPresenterShortcuts')}</p>
    </div>
  );
}
