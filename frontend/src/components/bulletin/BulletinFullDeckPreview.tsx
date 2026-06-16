import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { fetchBulletinTemplateMap, type WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';

const FALLBACK_TOTAL_SLIDES = 38;
const EAGER_SLIDE_COUNT = 3;

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
  scrollIntoView: boolean;
  emptyLabel: string;
  scrollRoot: RefObject<HTMLElement | null>;
  eager?: boolean;
};

function LazySlideItem({
  slideNumber,
  patch,
  highlight,
  label,
  scrollIntoView,
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

  useEffect(() => {
    if (scrollIntoView && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [scrollIntoView]);

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

type BulletinFullDeckPreviewProps = {
  bulletin: WeeklyBulletin;
  highlightSlides?: number[];
};

export default function BulletinFullDeckPreview({
  bulletin,
  highlightSlides = [],
}: BulletinFullDeckPreviewProps) {
  const { t } = useI18n();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [totalSlides, setTotalSlides] = useState(FALLBACK_TOTAL_SLIDES);
  const highlightSet = useMemo(() => new Set(highlightSlides), [highlightSlides]);
  const scrollTarget = highlightSlides[0];

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
          scrollIntoView={page === scrollTarget}
          emptyLabel={t('bulletin.coverPreviewEmpty')}
          scrollRoot={scrollRootRef}
          eager={page <= EAGER_SLIDE_COUNT}
        />
      ))}
    </div>
  );
}
