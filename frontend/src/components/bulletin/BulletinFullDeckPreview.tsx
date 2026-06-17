import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { fetchBulletinTemplateMap, type WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';

const FALLBACK_TOTAL_SLIDES = 38;
const EAGER_SLIDE_COUNT = 3;

export type BulletinPreviewScrollRequest = {
  slide: number;
  id: number;
};

type LazySlideItemProps = {
  slideNumber: number;
  patch: {
    serviceDate: string;
    serviceTime: string;
    scriptureBook?: string;
    scriptureReference?: string;
  };
  highlight: boolean;
  label: string;
  emptyLabel: string;
  scrollRoot: RefObject<HTMLElement | null>;
  eager?: boolean;
};

function LazySlideItem({
  slideNumber,
  patch,
  highlight,
  label,
  emptyLabel,
  scrollRoot,
  eager,
}: LazySlideItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(Boolean(eager));

  useEffect(() => {
    if (eager) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const root = scrollRoot.current;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { root, rootMargin: '240px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, scrollRoot]);

  return (
    <div
      ref={ref}
      className={`bulletin-deck-slide${highlight ? ' bulletin-deck-slide--highlight' : ''}`}
      data-slide={slideNumber}
    >
      {visible ? (
        <BulletinPptSlidePreview
          slideNumber={slideNumber}
          patch={patch}
          requireDate={false}
          emptyLabel={emptyLabel}
          slideLabel={label}
        />
      ) : (
        <figure className="bulletin-slide-preview">
          <figcaption className="bulletin-slide-preview-caption">{label}</figcaption>
          <div className="bulletin-slide-preview bulletin-slide-preview--loading">
            <div className="preview-spinner" />
          </div>
        </figure>
      )}
    </div>
  );
}

function scrollSlideIntoDeck(
  root: HTMLElement,
  slideNumber: number,
  behavior: ScrollBehavior = 'smooth',
): void {
  const el = root.querySelector<HTMLElement>(`[data-slide="${slideNumber}"]`);
  if (!el) return;
  const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
  root.scrollTo({ top: Math.max(0, top - 6), behavior });
}

type BulletinFullDeckPreviewProps = {
  bulletin: WeeklyBulletin;
  highlightSlides?: number[];
  scrollRequest?: BulletinPreviewScrollRequest | null;
};

export default function BulletinFullDeckPreview({
  bulletin,
  highlightSlides = [],
  scrollRequest = null,
}: BulletinFullDeckPreviewProps) {
  const { t } = useI18n();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [totalSlides, setTotalSlides] = useState(FALLBACK_TOTAL_SLIDES);
  const [forcedVisibleSlides, setForcedVisibleSlides] = useState<Set<number>>(() => new Set());
  const highlightSet = useMemo(() => new Set(highlightSlides), [highlightSlides]);

  const patch = useMemo(
    () => ({
      serviceDate: bulletin.serviceDate || nextSundayIso(),
      serviceTime: bulletin.serviceTime || '11:00',
      scriptureBook: bulletin.scriptureBook,
      scriptureReference: bulletin.scriptureReference,
    }),
    [
      bulletin.serviceDate,
      bulletin.serviceTime,
      bulletin.scriptureBook,
      bulletin.scriptureReference,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchBulletinTemplateMap()
      .then((map) => {
        if (!cancelled && map.totalSlides > 0) setTotalSlides(map.totalSlides);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scrollRequest) return;
    const slide = scrollRequest.slide;
    if (slide < 1) return;

    setForcedVisibleSlides((prev) => {
      if (prev.has(slide)) return prev;
      const next = new Set(prev);
      next.add(slide);
      return next;
    });

    const root = scrollRootRef.current;
    if (!root) return;

    const runScroll = () => scrollSlideIntoDeck(root, slide);
    const raf = window.requestAnimationFrame(() => {
      runScroll();
      window.requestAnimationFrame(runScroll);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [scrollRequest?.id, scrollRequest?.slide]);

  const slides = useMemo(
    () => Array.from({ length: totalSlides }, (_, i) => i + 1),
    [totalSlides],
  );

  return (
    <div ref={scrollRootRef} className="bulletin-deck-preview">
      <p className="bulletin-deck-preview-meta">
        {t('bulletin.previewDeckMeta', { count: totalSlides })}
        {highlightSlides.length > 0 ? ` · ${t('bulletin.previewDeckHighlightNote')}` : ''}
      </p>
      {slides.map((page) => (
        <LazySlideItem
          key={page}
          slideNumber={page}
          patch={patch}
          highlight={highlightSet.has(page)}
          label={t('bulletin.previewSlideSingle', { page })}
          emptyLabel={t('bulletin.coverPreviewEmpty')}
          scrollRoot={scrollRootRef}
          eager={
            page <= EAGER_SLIDE_COUNT || highlightSet.has(page) || forcedVisibleSlides.has(page)
          }
        />
      ))}
    </div>
  );
}
