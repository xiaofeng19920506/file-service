import { useEffect, useState, type ReactNode } from 'react';
import { fetchBulletinSlidePreviewPng } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import PreviewConversionGuide from '../PreviewConversionGuide';

type BulletinPptSlidePreviewProps = {
  slideNumber: number;
  /** 封面步骤：仅替换日期/时间文字 */
  patch?: {
    serviceDate: string;
    serviceTime?: string;
    scriptureBook?: string;
    scriptureReference?: string;
    preServiceChairNames?: string;
  };
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

  useEffect(() => {
    if (requireDate && !patch?.serviceDate) {
      setPreviewUrl(null);
      setUnavailable(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setUnavailable(false);
      void fetchBulletinSlidePreviewPng(slideNumber, {
        serviceDate: patch?.serviceDate,
        serviceTime: patch?.serviceTime || '11:00',
        scriptureBook: patch?.scriptureBook,
        scriptureReference: patch?.scriptureReference,
        preServiceChairNames: patch?.preServiceChairNames,
      })
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
        })
        .catch(() => {
          if (!cancelled) {
            setPreviewUrl(null);
            setUnavailable(true);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    slideNumber,
    patch?.serviceDate,
    patch?.serviceTime,
    patch?.scriptureBook,
    patch?.scriptureReference,
    patch?.preServiceChairNames,
    requireDate,
  ]);

  const rootClass = `bulletin-slide-preview${large ? ' bulletin-slide-preview--large' : ''}`;
  const showLoading = externalLoading || loading;

  if (showLoading) {
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

  if (unavailable) {
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
    <figure className={rootClass}>
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div className="bulletin-slide-preview-frame bulletin-slide-preview-frame--png">
        <img className="bulletin-slide-preview-img" src={previewUrl} alt="" draggable={false} />
        {overlay}
      </div>
    </figure>
  );
}
