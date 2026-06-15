import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchBulletinTemplateMap, type WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';

const FALLBACK_TOTAL_SLIDES = 38;

type LazySlideItemProps = {
  slideNumber: number;
  patch: { serviceDate: string; serviceTime: string };
  highlight: boolean;
  label: string;
  scrollIntoView: boolean;
  emptyLabel: string;
};

function LazySlideItem({
  slideNumber,
  patch,
  highlight,
  label,
  scrollIntoView,
  emptyLabel,
}: LazySlideItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: '320px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
  const [totalSlides, setTotalSlides] = useState(FALLBACK_TOTAL_SLIDES);
  const highlightSet = useMemo(() => new Set(highlightSlides), [highlightSlides]);
  const scrollTarget = highlightSlides[0];

  const patch = useMemo(
    () => ({
      serviceDate: bulletin.serviceDate || nextSundayIso(),
      serviceTime: bulletin.serviceTime || '11:00',
    }),
    [bulletin.serviceDate, bulletin.serviceTime],
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
    <div className="bulletin-deck-preview">
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
        />
      ))}
    </div>
  );
}
