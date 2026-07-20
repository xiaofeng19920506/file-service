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
  /** 仅包含会影响本页像素的字段（由 previewPatchForSection 裁剪） */
  patch?: BulletinSlidePreviewParams;
  requireDate?: boolean;
  loading?: boolean;
  emptyLabel: string;
  slideLabel?: string;
  large?: boolean;
  overlay?: ReactNode;
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
}: BulletinPptSlidePreviewProps) {
  const { t } = useI18n();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  previewUrlRef.current = previewUrl;
  const patchRef = useRef(patch);
  patchRef.current = patch;

  const cacheKey = bulletinPreviewCacheKey(slideNumber, patch ?? {});

  useEffect(() => {
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
      // stale-while-revalidate：已有图时不卸图，避免无关页整卷闪白
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
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (createdUrl && createdUrl !== previewUrlRef.current) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [cacheKey, slideNumber, requireDate]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const rootClass = `bulletin-slide-preview${large ? ' bulletin-slide-preview--large' : ''}`;
  const showLoading = externalLoading || loading;

  if (showLoading && !previewUrl) {
    return (
      <div className={`${rootClass} bulletin-slide-preview--loading`}>
        <div className="preview-spinner" />
      </div>
    );
  }

  if (requireDate && !patch?.serviceDate) {
    return (
      <div className={`${rootClass} bulletin-slide-preview--empty`}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  if (unavailable && !previewUrl) {
    return (
      <figure className={rootClass}>
        {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
        <PreviewConversionGuide fileName="06_14_2026.pptx" compact />
        <p className="bulletin-slide-preview-fallback-note">{t('bulletin.previewUnavailableHint')}</p>
      </figure>
    );
  }

  if (!previewUrl) {
    return (
      <div className={`${rootClass} bulletin-slide-preview--empty`}>
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <figure className={`${rootClass}${showLoading ? ' bulletin-slide-preview--refreshing' : ''}`}>
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div className="bulletin-slide-preview-frame bulletin-slide-preview-frame--png">
        <img className="bulletin-slide-preview-img" src={previewUrl} alt="" draggable={false} />
        {overlay}
      </div>
    </figure>
  );
}
