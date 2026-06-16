import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchBulletinSlidePreviewPng,
  fetchBulletinTemplateMap,
  type BulletinSlidePreviewParams,
} from '../../api/bulletins';
import { useI18n } from '../../i18n';

const FALLBACK_TOTAL_SLIDES = 38;

type BulletinSlideShowProps = {
  open: boolean;
  onClose: () => void;
  initialSlide?: number;
  patch: BulletinSlidePreviewParams;
};

export default function BulletinSlideShow({
  open,
  onClose,
  initialSlide = 1,
  patch,
}: BulletinSlideShowProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const urlCacheRef = useRef<Map<number, string>>(new Map());
  const [totalSlides, setTotalSlides] = useState(FALLBACK_TOTAL_SLIDES);
  const [currentSlide, setCurrentSlide] = useState(initialSlide);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const revokeCache = useCallback(() => {
    for (const url of urlCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    urlCacheRef.current.clear();
  }, []);

  const loadSlide = useCallback(
    async (slideNumber: number) => {
      const cached = urlCacheRef.current.get(slideNumber);
      if (cached) return cached;
      const blob = await fetchBulletinSlidePreviewPng(slideNumber, patch);
      const url = URL.createObjectURL(blob);
      urlCacheRef.current.set(slideNumber, url);
      return url;
    },
    [patch],
  );

  useEffect(() => {
    if (!open) return;
    setCurrentSlide(initialSlide);
  }, [open, initialSlide]);

  useEffect(() => {
    if (!open) {
      revokeCache();
      setImageUrl(null);
      setError(false);
      return;
    }

    let cancelled = false;
    void fetchBulletinTemplateMap()
      .then((map) => {
        if (!cancelled && map.totalSlides > 0) setTotalSlides(map.totalSlides);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      revokeCache();
    };
  }, [open, revokeCache]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    void loadSlide(currentSlide)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setImageUrl(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    for (const nearby of [currentSlide - 1, currentSlide + 1]) {
      if (nearby >= 1 && nearby <= totalSlides) {
        void loadSlide(nearby).catch(() => undefined);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [open, currentSlide, loadSlide, totalSlides]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const goPrev = useCallback(() => {
    setCurrentSlide((n) => Math.max(1, n - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentSlide((n) => Math.min(totalSlides, n + 1));
  }, [totalSlides]);

  const toggleFullscreen = useCallback(async () => {
    const el = rootRef.current;
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'Escape') {
        const doc = document as Document & { webkitFullscreenElement?: Element };
        if (document.fullscreenElement || doc.webkitFullscreenElement) {
          void document.exitFullscreen();
          return;
        }
        onClose();
      } else if (event.key === 'f' || event.key === 'F') {
        void toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, goNext, goPrev, onClose, toggleFullscreen]);

  const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    if (ratio < 0.35) goPrev();
    else if (ratio > 0.65) goNext();
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div ref={rootRef} className="bulletin-slideshow" role="dialog" aria-modal="true">
      <div className="bulletin-slideshow-stage" onClick={onStageClick}>
        {loading && (
          <div className="bulletin-slideshow-loading">
            <div className="preview-spinner" />
          </div>
        )}
        {!loading && error && (
          <p className="bulletin-slideshow-error">{t('bulletin.previewUnavailableHint')}</p>
        )}
        {!loading && !error && imageUrl && (
          <img className="bulletin-slideshow-img" src={imageUrl} alt="" draggable={false} />
        )}
      </div>

      <div className="bulletin-slideshow-toolbar">
        <button
          type="button"
          className="bulletin-slideshow-nav"
          disabled={currentSlide <= 1}
          onClick={goPrev}
          aria-label={t('bulletin.previewPrev')}
        >
          ‹
        </button>
        <span className="bulletin-slideshow-counter">
          {t('preview.slideCounter', { current: currentSlide, total: totalSlides })}
        </span>
        <button
          type="button"
          className="bulletin-slideshow-nav"
          disabled={currentSlide >= totalSlides}
          onClick={goNext}
          aria-label={t('bulletin.previewNext')}
        >
          ›
        </button>
        <button type="button" className="btn-secondary" onClick={() => void toggleFullscreen()}>
          {t('bulletin.slideShowFullscreen')}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t('bulletin.slideShowExit')}
        </button>
      </div>

      <p className="bulletin-slideshow-hint">{t('bulletin.slideShowHint')}</p>
    </div>,
    document.body,
  );
}
