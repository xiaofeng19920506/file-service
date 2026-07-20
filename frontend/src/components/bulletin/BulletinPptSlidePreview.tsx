import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  fetchBulletinSlidePreviewPng,
  type BulletinSlidePreviewParams,
} from '../../api/bulletins';
import { useI18n } from '../../i18n';
import {
  getBulletinPreviewBlob,
  setBulletinPreviewBlob,
} from '../../lib/bulletin-preview-blob-cache';
import { bulletinPreviewCacheKey } from '../../lib/bulletin-preview-patch';
import PreviewConversionGuide from '../PreviewConversionGuide';

type BulletinPptSlidePreviewProps = {
  slideNumber: number;
  /** 由 previewPatchForSection 裁剪；经文参数须与 deck 结构一致 */
  patch?: BulletinSlidePreviewParams;
  requireDate?: boolean;
  loading?: boolean;
  emptyLabel: string;
  slideLabel?: string;
  large?: boolean;
  overlay?: ReactNode;
  /** 进入视口后再拉 PNG；默认 true（整卷 deck 用）。单页场景可关 */
  lazy?: boolean;
};

export default function BulletinPptSlidePreview({
  slideNumber,
  patch,
  requireDate,
  loading: externalLoading,
  emptyLabel,
  slideLabel,
  large,
  overlay,
  lazy = true,
}: BulletinPptSlidePreviewProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(!lazy);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  previewUrlRef.current = previewUrl;
  const patchRef = useRef(patch);
  patchRef.current = patch;

  const cacheKey = bulletinPreviewCacheKey(slideNumber, patch ?? {});

  useEffect(() => {
    if (!lazy || inView) return;
    const el = rootRef.current;
    if (!el) return;
    const root = el.closest('.bulletin-deck-preview') ?? null;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { root, rootMargin: '280px 0px', threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [lazy, inView]);

  useEffect(() => {
    if (!inView) return;

    const currentPatch = patchRef.current;
    if (requireDate && !currentPatch?.serviceDate) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setUnavailable(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    const applyBlob = (blob: Blob) => {
      if (cancelled) return;
      createdUrl = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return createdUrl;
      });
      setUnavailable(false);
      setLoading(false);
    };

    const cached = getBulletinPreviewBlob(cacheKey);
    if (cached) {
      applyBlob(cached);
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      if (!previewUrlRef.current) setLoading(true);
      setUnavailable(false);
      void fetchBulletinSlidePreviewPng(slideNumber, patchRef.current ?? {})
        .then((blob) => {
          setBulletinPreviewBlob(cacheKey, blob);
          applyBlob(blob);
        })
        .catch(() => {
          if (cancelled) return;
          if (!previewUrlRef.current) {
            setPreviewUrl(null);
            setUnavailable(true);
          }
          setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (createdUrl && createdUrl !== previewUrlRef.current) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [cacheKey, slideNumber, requireDate, inView]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const rootClass = `bulletin-slide-preview${large ? ' bulletin-slide-preview--large' : ''}`;
  const showLoading = externalLoading || loading || (lazy && !inView);

  if (showLoading && !previewUrl) {
    return (
      <div ref={rootRef} className={`${rootClass} bulletin-slide-preview--loading`}>
        <div className="preview-spinner" />
      </div>
    );
  }

  if (requireDate && !patch?.serviceDate) {
    return (
      <div ref={rootRef} className={`${rootClass} bulletin-slide-preview--empty`}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  if (unavailable && !previewUrl) {
    return (
      <figure ref={rootRef} className={rootClass}>
        {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
        <PreviewConversionGuide fileName="06_14_2026.pptx" compact />
        <p className="bulletin-slide-preview-fallback-note">{t('bulletin.previewUnavailableHint')}</p>
      </figure>
    );
  }

  if (!previewUrl) {
    return (
      <div ref={rootRef} className={`${rootClass} bulletin-slide-preview--empty`}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <figure
      ref={rootRef}
      className={`${rootClass}${showLoading ? ' bulletin-slide-preview--refreshing' : ''}`}
    >
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div className="bulletin-slide-preview-frame bulletin-slide-preview-frame--png">
        <img className="bulletin-slide-preview-img" src={previewUrl} alt="" draggable={false} />
        {overlay}
      </div>
    </figure>
  );
}
