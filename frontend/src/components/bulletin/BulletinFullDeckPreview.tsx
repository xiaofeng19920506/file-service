import { useCallback, useEffect, useMemo, useRef } from 'react';
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

export type BulletinPreviewScrollRequest = {
  slide: number;
  id: number;
};

type DeckSlideItemProps = {
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
  bulletinId: string;
  worshipPlaylistId: string | null;
  worshipPlaylistTitle: string;
  worshipItems: PlaylistItem[];
  worshipFirstSlide: number | null;
};

function DeckSlideItem({
  slideNumber,
  patch,
  highlight,
  label,
  emptyLabel,
  bulletinId,
  worshipPlaylistId,
  worshipPlaylistTitle,
  worshipItems,
  worshipFirstSlide,
}: DeckSlideItemProps) {
  const showWorshipPlayer =
    worshipFirstSlide != null &&
    slideNumber === worshipFirstSlide &&
    worshipPlaylistId &&
    hasBulletinWorshipPlayItems(worshipItems);

  return (
    <div
      className={`bulletin-deck-slide${highlight ? ' bulletin-deck-slide--highlight' : ''}${showWorshipPlayer ? ' bulletin-deck-slide--worship' : ''}`}
      data-slide={slideNumber}
    >
      {showWorshipPlayer ? (
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
      )}
    </div>
  );
}

function scrollSlideIntoDeck(root: HTMLElement, slideNumber: number, behavior: ScrollBehavior): boolean {
  const el = root.querySelector<HTMLElement>(`[data-slide="${slideNumber}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior, block: 'start' });
  return true;
}

function runScrollToSlide(root: HTMLElement, slide: number): void {
  scrollSlideIntoDeck(root, slide, 'auto');
  window.requestAnimationFrame(() => {
    scrollSlideIntoDeck(root, slide, 'auto');
    window.requestAnimationFrame(() => {
      scrollSlideIntoDeck(root, slide, 'smooth');
    });
  });
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
  const highlightSet = useMemo(() => new Set(highlightSlides), [highlightSlides]);

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

  useEffect(() => {
    if (!scrollRequest || !deckPlan) return;
    const slide = scrollRequest.slide;
    if (slide < 1 || slide > deckPlan.totalSlides) return;

    scrollSyncUntilRef.current = Date.now() + 1200;

    const root = scrollRootRef.current;
    if (!root) return;

    runScrollToSlide(root, slide);

    const retryTimers = [120, 350, 700, 1200].map((delay) =>
      window.setTimeout(() => {
        runScrollToSlide(root, slide);
        if (delay === 1200) {
          scrollSyncUntilRef.current = Date.now() + 300;
        }
      }, delay),
    );

    return () => retryTimers.forEach((timer) => window.clearTimeout(timer));
  }, [scrollRequest?.id, scrollRequest?.slide, deckPlan]);

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
    if (!root || !onVisibleSlideChange || !deckPlan) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        reportVisibleSlide();
      });
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    const initialTimer = window.setTimeout(reportVisibleSlide, 150);

    return () => {
      root.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(initialTimer);
    };
  }, [onVisibleSlideChange, reportVisibleSlide, deckPlan]);

  const slides = useMemo(
    () => (deckPlan ? Array.from({ length: deckPlan.totalSlides }, (_, i) => i + 1) : []),
    [deckPlan],
  );

  if (!deckPlan) {
    return (
      <div className="bulletin-deck-preview bulletin-deck-preview--loading-plan">
        <div className="preview-spinner" />
        <p>{t('bulletin.previewPlanLoading')}</p>
      </div>
    );
  }

  return (
    <div ref={scrollRootRef} className="bulletin-deck-preview">
      <p className="bulletin-deck-preview-meta">
        {t('bulletin.previewDeckMeta', { count: deckPlan.totalSlides })}
        {highlightSlides.length > 0 ? ` · ${t('bulletin.previewDeckHighlightNote')}` : ''}
      </p>
      {slides.map((page) => (
        <DeckSlideItem
          key={page}
          slideNumber={page}
          patch={patch}
          highlight={highlightSet.has(page)}
          label={t('bulletin.previewSlideSingle', { page })}
          emptyLabel={t('bulletin.coverPreviewEmpty')}
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
