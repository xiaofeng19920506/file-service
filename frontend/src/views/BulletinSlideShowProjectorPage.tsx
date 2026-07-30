import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useBulletinSlideShow } from '../hooks/useBulletinSlideShow';
import { createSlideShowBus } from '../lib/bulletin-slideshow-bus';
import {
  exitDocumentFullscreen,
  isDocumentFullscreen,
  requestElementFullscreen,
} from '../lib/fullscreen';
import {
  readSlideShowSession,
  type BulletinSlideShowSession,
} from '../lib/bulletin-slideshow-session';

type BulletinSlideShowProjectorPageProps = {
  sessionId: string;
};

export default function BulletinSlideShowProjectorPage({ sessionId }: BulletinSlideShowProjectorPageProps) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const [needsFullscreenGesture, setNeedsFullscreenGesture] = useState(false);
  // 一次读入内存：StrictMode 会卸载再挂载，切勿在 effect cleanup 里删 localStorage
  const [session] = useState<BulletinSlideShowSession | null>(() =>
    readSlideShowSession(sessionId),
  );

  const show = useBulletinSlideShow({
    sessionId,
    role: 'projector',
    patch: session?.patch ?? {},
    initialSlide: session?.initialSlide ?? 1,
    initialTotalSlides: session?.totalSlides,
  });

  const enterFullscreen = async (): Promise<boolean> => {
    const el = stageRef.current ?? document.documentElement;
    const ok = await requestElementFullscreen(el);
    if (ok) setNeedsFullscreenGesture(false);
    return ok;
  };

  useEffect(() => {
    document.documentElement.classList.add('bulletin-slideshow-window');
    document.body.classList.add('bulletin-slideshow-window');
    stageRef.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.classList.remove('bulletin-slideshow-window');
      document.body.classList.remove('bulletin-slideshow-window');
    };
  }, []);

  // 进入即尝试全屏；被浏览器策略拦截时显示「点击进入全屏」遮罩
  useEffect(() => {
    let cancelled = false;
    const tryEnter = async () => {
      const ok = await enterFullscreen();
      if (!cancelled && !ok && !isDocumentFullscreen()) {
        setNeedsFullscreenGesture(true);
      }
    };
    const timer = window.setTimeout(() => {
      void tryEnter();
    }, 50);
    const onFsChange = () => {
      if (isDocumentFullscreen()) setNeedsFullscreenGesture(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only fullscreen bootstrap
  }, []);

  useEffect(() => {
    const bus = createSlideShowBus(sessionId);
    const unsubscribe = bus.subscribe((message) => {
      if (message.type !== 'fullscreen') return;
      void enterFullscreen();
    });
    return () => {
      unsubscribe();
      bus.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (needsFullscreenGesture) {
        // 任意键先进入全屏，再处理翻页
        e.preventDefault();
        void enterFullscreen().then((ok) => {
          if (!ok) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
            show.goNext();
          } else if (
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowUp' ||
            e.key === 'PageUp' ||
            e.key === 'Backspace'
          ) {
            show.goPrev();
          }
        });
        return;
      }
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
        if (isDocumentFullscreen()) {
          void exitDocumentFullscreen();
          return;
        }
        void enterFullscreen();
        return;
      }
      if (e.key === 'Escape') {
        if (isDocumentFullscreen()) {
          void exitDocumentFullscreen();
          return;
        }
        show.endShow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    needsFullscreenGesture,
    show.goNext,
    show.goPrev,
    show.goToSlide,
    show.endShow,
    show.totalSlides,
  ]);

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
      {needsFullscreenGesture && (
        <button
          type="button"
          className="bulletin-slideshow-projector-fs-gate"
          onClick={() => {
            void enterFullscreen();
          }}
        >
          <span className="bulletin-slideshow-projector-fs-gate-title">
            {t('bulletin.slideShowEnterFullscreen')}
          </span>
          <span className="bulletin-slideshow-projector-fs-gate-hint">
            {t('bulletin.slideShowEnterFullscreenHint')}
          </span>
        </button>
      )}
      {!needsFullscreenGesture && (
        <div className="bulletin-slideshow-projector-hint" aria-hidden="true">
          {show.currentSlide}/{show.totalSlides} · {t('bulletin.slideShowHint')}
        </div>
      )}
    </div>
  );
}
