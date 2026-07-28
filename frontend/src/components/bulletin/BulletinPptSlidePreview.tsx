import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  fetchBulletinSlidePreviewPng,
  type BulletinSlidePreviewParams,
} from '../../api/bulletins';
import type { BulletinPreviewPriority } from '../../lib/bulletin-preview-queue';
import { useI18n } from '../../i18n';
import {
  getBulletinPreviewBlob,
  setBulletinPreviewBlob,
} from '../../lib/bulletin-preview-blob-cache';
import { upcomingSundayIso } from '../../lib/bulletin-date';
import { bulletinPreviewCacheKey } from '../../lib/bulletin-preview-patch';

type BulletinPptSlidePreviewProps = {
  slideNumber: number;
  /** 由 previewPatchFull 生成；经文参数须与 deck 结构一致 */
  patch?: BulletinSlidePreviewParams;
  /** 分区 id：用于分区感知缓存，改无关分区不废本页 PNG */
  sectionId?: string;
  loading?: boolean;
  slideLabel?: string;
  large?: boolean;
  overlay?: ReactNode;
  /**
   * 进入视口（或 rootMargin）后再拉 PNG；默认 true。
   * 单页场景可关。
   */
  lazy?: boolean;
  /**
   * 预取优先级：high=视口内，normal=临近，low=后台。
   * lazy 开启时，真正进入视口会自动升为 high。
   */
  priority?: BulletinPreviewPriority;
  /** IntersectionObserver rootMargin，控制提前加载距离 */
  rootMargin?: string;
};

function withPreviewDate(patch?: BulletinSlidePreviewParams): BulletinSlidePreviewParams {
  const base = patch ?? {};
  const serviceDate = base.serviceDate?.trim() || upcomingSundayIso();
  return { ...base, serviceDate, serviceTime: base.serviceTime || '11:00' };
}

const AUTO_RETRIES = 2;

export default function BulletinPptSlidePreview({
  slideNumber,
  patch,
  sectionId,
  loading: externalLoading,
  slideLabel,
  large,
  overlay,
  lazy = true,
  priority: priorityProp = 'normal',
  rootMargin = '160px 0px',
}: BulletinPptSlidePreviewProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(!lazy);
  const [nearView, setNearView] = useState(!lazy);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const previewUrlRef = useRef<string | null>(null);
  previewUrlRef.current = previewUrl;

  const effectivePatch = withPreviewDate(patch);
  const patchRef = useRef(effectivePatch);
  patchRef.current = effectivePatch;

  const cacheKey = bulletinPreviewCacheKey(slideNumber, effectivePatch, sectionId);
  const shouldFetch = !lazy || nearView || inView;
  const schedulePriority: BulletinPreviewPriority = inView ? 'high' : priorityProp;
  const schedulePriorityRef = useRef(schedulePriority);
  schedulePriorityRef.current = schedulePriority;

  useEffect(() => {
    if (!lazy) return;
    const el = rootRef.current;
    if (!el) return;
    const root = el.closest('.bulletin-deck-preview') ?? null;

    const nearObs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNearView(true);
      },
      { root, rootMargin, threshold: 0.01 },
    );
    const viewObs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { root, rootMargin: '0px', threshold: 0.01 },
    );
    nearObs.observe(el);
    viewObs.observe(el);
    return () => {
      nearObs.disconnect();
      viewObs.disconnect();
    };
  }, [lazy, rootMargin]);

  useEffect(() => {
    if (!shouldFetch) return;

    let cancelled = false;
    let createdUrl: string | null = null;
    let attempt = 0;

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

    setLoading(true);
    setUnavailable(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    const priority = schedulePriorityRef.current;
    const baseDelay = priority === 'high' ? 0 : priority === 'normal' ? 40 : 160;
    let timer = 0;

    const runFetch = () => {
      void fetchBulletinSlidePreviewPng(slideNumber, patchRef.current, { priority })
        .then((blob) => {
          setBulletinPreviewBlob(cacheKey, blob);
          applyBlob(blob);
        })
        .catch(() => {
          if (cancelled) return;
          if (attempt < AUTO_RETRIES) {
            attempt += 1;
            timer = window.setTimeout(runFetch, 400 * attempt);
            return;
          }
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          setUnavailable(true);
          setLoading(false);
        });
    };

    timer = window.setTimeout(runFetch, baseDelay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (createdUrl && createdUrl !== previewUrlRef.current) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [cacheKey, slideNumber, shouldFetch, retryTick]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const rootClass = `bulletin-slide-preview${large ? ' bulletin-slide-preview--large' : ''}`;
  const showLoading = externalLoading || loading || (lazy && !shouldFetch);

  if (!previewUrl && !unavailable) {
    return (
      <div ref={rootRef} className={`${rootClass} bulletin-slide-preview--loading`}>
        {(showLoading || shouldFetch) && <div className="preview-spinner" />}
      </div>
    );
  }

  if (unavailable && !previewUrl) {
    return (
      <figure ref={rootRef} className={rootClass}>
        {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
        <div className="bulletin-slide-preview-retry">
          <p className="bulletin-slide-preview-fallback-note">{t('bulletin.previewUnavailableHint')}</p>
          <button
            type="button"
            className="bulletin-slide-preview-retry-btn"
            onClick={() => {
              setUnavailable(false);
              setRetryTick((n) => n + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      </figure>
    );
  }

  return (
    <figure
      ref={rootRef}
      className={`${rootClass}${showLoading ? ' bulletin-slide-preview--refreshing' : ''}`}
    >
      {slideLabel && <figcaption className="bulletin-slide-preview-caption">{slideLabel}</figcaption>}
      <div className="bulletin-slide-preview-frame bulletin-slide-preview-frame--png">
        <img className="bulletin-slide-preview-img" src={previewUrl!} alt="" draggable={false} />
        {overlay}
      </div>
    </figure>
  );
}
