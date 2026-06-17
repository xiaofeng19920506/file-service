import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import { useI18n } from '../../i18n';
import type { BulletinDeckPlan } from '../../lib/bulletin-deck-plan';
import { worshipSlidesFromPlan } from '../../lib/bulletin-deck-plan';
import { nextSundayIso } from '../../lib/bulletin-date';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';
import BulletinWorshipEmbeddedPlayer, {
  hasBulletinWorshipPlayItems,
} from './BulletinWorshipEmbeddedPlayer';

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
  bulletinId: string;
  worshipPlaylistId: string | null;
  worshipPlaylistTitle: string;
  worshipItems: PlaylistItem[];
  worshipFirstSlide: number | null;
};

function LazySlideItem({
  slideNumber,
  patch,
  highlight,
  label,
  emptyLabel,
  scrollRoot,
  eager,
  bulletinId,
  worshipPlaylistId,
  worshipPlaylistTitle,
  worshipItems,
  worshipFirstSlide,
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
      { root, rootMargin: '480px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, scrollRoot]);

  const showWorshipPlayer =
    worshipFirstSlide != null &&
    slideNumber === worshipFirstSlide &&
    worshipPlaylistId &&
    hasBulletinWorshipPlayItems(worshipItems);

  return (
    <div
      ref={ref}
      className={`bulletin-deck-slide${highlight ? ' bulletin-deck-slide--highlight' : ''}${showWorshipPlayer ? ' bulletin-deck-slide--worship' : ''}`}
      data-slide={slideNumber}
    >
      {visible ? (
        showWorshipPlayer ? (
          <BulletinWorshipEmbeddedPlayer
            bulletinId={bulletinId}
            playlistId={worshipPlaylistId!}
            playlistTitle={worshipPlaylistTitle}
            items={worshipItems}
            slideNumber={slideNumber}
            patch={patch}
            slideLabel={label}
            emptyLabel={emptyLabel}
          />
        ) : (
          <BulletinPptSlidePreview
            slideNumber={slideNumber}
            patch={patch}
            requireDate={false}
            emptyLabel={emptyLabel}
            slideLabel={label}
          />
        )
      ) : (
        <figure className="bulletin-slide-preview">
          <figcaption className="bulletin-slide-preview-caption">{label}</figcaption>
          <div className="bulletin-slide-preview bulletin-slide-preview--loading bulletin-slide-preview--placeholder">
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
): boolean {
  const el = root.querySelector<HTMLElement>(`[data-slide="${slideNumber}"]`);
  if (!el) return false;
  const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
  root.scrollTo({ top: Math.max(0, top - 6), behavior });
  return true;
}

function scheduleScrollRetries(
  root: HTMLElement,
  slide: number,
  onDone?: () => void,
): () => void {
  const delays = [0, 80, 200, 450, 900, 1500];
  const timers = delays.map((delay, index) =>
    window.setTimeout(() => {
      scrollSlideIntoDeck(root, slide, index === 0 ? 'auto' : 'smooth');
      if (index === delays.length - 1) onDone?.();
    }, delay),
  );
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

type BulletinFullDeckPreviewProps = {
  bulletin: WeeklyBulletin;
  deckPlan: BulletinDeckPlan | null;
  highlightSlides?: number[];
  scrollRequest?: BulletinPreviewScrollRequest | null;
  worshipItems?: PlaylistItem[];
  worshipPlaylistTitle?: string;
  onVisibleSlideChange?: (slideNumber: number) => void;
};

export default function BulletinFullDeckPreview({
  bulletin,
  deckPlan,
  highlightSlides = [],
  scrollRequest = null,
  worshipItems = [],
  worshipPlaylistTitle = '',
  onVisibleSlideChange,
}: BulletinFullDeckPreviewProps) {
  const { t } = useI18n();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const scrollSyncUntilRef = useRef(0);
  const [forcedVisibleSlides, setForcedVisibleSlides] = useState<Set<number>>(() => new Set());
  const highlightSet = useMemo(() => new Set(highlightSlides), [highlightSlides]);

  const totalSlides = deckPlan?.totalSlides ?? FALLBACK_TOTAL_SLIDES;
  const worshipFirstSlide = worshipSlidesFromPlan(deckPlan)[0] ?? null;

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

  const primeSlidesForScroll = useCallback((targetSlide: number) => {
    setForcedVisibleSlides((prev) => {
      const next = new Set(prev);
      for (let page = 1; page <= targetSlide; page++) next.add(page);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!scrollRequest) return;
    const slide = scrollRequest.slide;
    if (slide < 1) return;

    scrollSyncUntilRef.current = Date.now() + 1600;
    primeSlidesForScroll(slide);

    const root = scrollRootRef.current;
    if (!root) return;

    return scheduleScrollRetries(root, slide, () => {
      scrollSyncUntilRef.current = Date.now() + 400;
    });
  }, [scrollRequest?.id, scrollRequest?.slide, deckPlan?.totalSlides, primeSlidesForScroll]);

  const reportVisibleSlide = useCallback(() => {
    if (!onVisibleSlideChange || Date.now() < scrollSyncUntilRef.current) return;
    const root = scrollRootRef.current;
    if (!root) return;

    const rootRect = root.getBoundingClientRect();
    const centerY = rootRect.top + rootRect.height * 0.42;
    let bestSlide = 1;
    let bestDistance = Number.POSITIVE_INFINITY;

    root.querySelectorAll<HTMLElement>('[data-slide]').forEach((el) => {
      const slide = Number(el.dataset.slide);
      if (!slide) return;
      const rect = el.getBoundingClientRect();
      const slideCenter = rect.top + rect.height / 2;
      const distance = Math.abs(slideCenter - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSlide = slide;
      }
    });

    onVisibleSlideChange(bestSlide);
  }, [onVisibleSlideChange]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || !onVisibleSlideChange) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        reportVisibleSlide();
      });
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    const initialTimer = window.setTimeout(reportVisibleSlide, 120);

    return () => {
      root.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(initialTimer);
    };
  }, [onVisibleSlideChange, reportVisibleSlide, totalSlides]);

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
          bulletinId={bulletin.id}
          worshipPlaylistId={bulletin.servicePlaylistId}
          worshipPlaylistTitle={worshipPlaylistTitle}
          worshipItems={worshipItems}
          worshipFirstSlide={worshipFirstSlide}
        />
      ))}
    </div>
  );
}
