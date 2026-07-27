import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import { useBulletinSlideShow } from '../hooks/useBulletinSlideShow';
import { createSlideShowBus } from '../lib/bulletin-slideshow-bus';
import { readSlideShowSession, removeSlideShowSession } from '../lib/bulletin-slideshow-session';

type BulletinSlideShowProjectorPageProps = {
  sessionId: string;
};

export default function BulletinSlideShowProjectorPage({ sessionId }: BulletinSlideShowProjectorPageProps) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const session = readSlideShowSession(sessionId);

  const show = useBulletinSlideShow({
    sessionId,
    role: 'projector',
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

  // 进入即尝试全屏，方便直接投影
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const timer = window.setTimeout(() => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      if (document.fullscreenElement || doc.webkitFullscreenElement) return;
      const request =
        el.requestFullscreen ??
        (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
      void request?.call(el)?.catch(() => undefined);
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const bus = createSlideShowBus(sessionId);
    const unsubscribe = bus.subscribe((message) => {
      if (message.type !== 'fullscreen') return;
      const el = stageRef.current;
      if (!el) return;
      const doc = document as Document & { webkitFullscreenElement?: Element };
      if (document.fullscreenElement || doc.webkitFullscreenElement) return;
      const request =
        el.requestFullscreen ??
        (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
      void request?.call(el);
    });
    return () => {
      unsubscribe();
      bus.close();
    };
  }, [sessionId]);

  // 投影窗自身即可翻页，无需演讲者窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        show.goNext();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault();
        show.goPrev();
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        show.goToSlide(1);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        show.goToSlide(show.totalSlides);
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        const el = stageRef.current;
        if (!el) return;
        const doc = document as Document & { webkitFullscreenElement?: Element };
        if (document.fullscreenElement || doc.webkitFullscreenElement) {
          void document.exitFullscreen?.();
          return;
        }
        const request =
          el.requestFullscreen ??
          (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
        void request?.call(el);
        return;
      }
      if (e.key === 'Escape') {
        const doc = document as Document & { webkitFullscreenElement?: Element };
        if (document.fullscreenElement || doc.webkitFullscreenElement) {
          void document.exitFullscreen?.();
          return;
        }
        show.endShow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show.goNext, show.goPrev, show.goToSlide, show.endShow, show.totalSlides]);

  useEffect(() => {
    const onBeforeUnload = () => {
      const bus = createSlideShowBus(sessionId);
      bus.publish({ type: 'close', from: 'projector' });
      bus.close();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sessionId]);

  if (!session) {
    return (
      <div className="bulletin-slideshow-projector bulletin-slideshow-projector--empty">
        <p>{t('bulletin.slideShowSessionExpired')}</p>
      </div>
    );
  }

  const currentUrl = show.slideUrls[show.currentSlide];
  const loading = show.loadingSlides.has(show.currentSlide);
  const failed = show.failedSlides.has(show.currentSlide);

  return (
    <div ref={stageRef} className="bulletin-slideshow-projector" tabIndex={0}>
      {loading && (
        <div className="bulletin-slideshow-projector-loading">
          <div className="preview-spinner" />
        </div>
      )}
      {!loading && failed && (
        <p className="bulletin-slideshow-projector-error">{t('bulletin.previewUnavailableHint')}</p>
      )}
      {!loading && !failed && currentUrl && (
        <img className="bulletin-slideshow-projector-img" src={currentUrl} alt="" draggable={false} />
      )}
      <div className="bulletin-slideshow-projector-hint" aria-hidden="true">
        {show.currentSlide}/{show.totalSlides} · {t('bulletin.slideShowHint')}
      </div>
    </div>
  );
}
