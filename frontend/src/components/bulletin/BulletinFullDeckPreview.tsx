import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import { useI18n } from '../../i18n';
import type { BulletinDeckPlan } from '../../lib/bulletin-deck-plan';
import {
  composeDeckSectionsForPreview,
  worshipFirstPresentationSlide,
} from '../../lib/bulletin-deck-plan';
import {
  bulletinPreviewCacheKey,
  previewPatchForSection,
  type BulletinPreviewPatchFields,
} from '../../lib/bulletin-preview-patch';
import { navSectionById } from '../../lib/bulletin-sections';
import { nextSundayIso } from '../../lib/bulletin-date';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';
import BulletinWorshipEmbeddedPlayer, {
  hasBulletinWorshipPlayItems,
} from './BulletinWorshipEmbeddedPlayer';

export type BulletinPreviewScrollRequest = {
  slide: number;
  id: number;
  sectionId?: string;
};

type DeckSlideItemProps = {
  slideNumber: number;
  sectionId: string;
  patch: BulletinPreviewPatchFields;
  highlight: boolean;
  label: string;
  emptyLabel: string;
  bulletinId: string;
  worshipPlaylistId: string | null;
  worshipPlaylistTitle: string;
  worshipItems: PlaylistItem[];
  worshipFirstSlide: number | null;
  worshipLyricsPptxBlobId: string | null;
};

function deckSlidePropsEqual(prev: DeckSlideItemProps, next: DeckSlideItemProps): boolean {
  if (
    prev.slideNumber !== next.slideNumber ||
    prev.sectionId !== next.sectionId ||
    prev.highlight !== next.highlight ||
    prev.label !== next.label ||
    prev.emptyLabel !== next.emptyLabel ||
    prev.bulletinId !== next.bulletinId ||
    prev.worshipPlaylistId !== next.worshipPlaylistId ||
    prev.worshipPlaylistTitle !== next.worshipPlaylistTitle ||
    prev.worshipFirstSlide !== next.worshipFirstSlide ||
    prev.worshipLyricsPptxBlobId !== next.worshipLyricsPptxBlobId ||
    prev.worshipItems !== next.worshipItems
  ) {
    return false;
  }
  const prevKey = bulletinPreviewCacheKey(
    prev.slideNumber,
    previewPatchForSection(prev.sectionId, prev.patch),
  );
  const nextKey = bulletinPreviewCacheKey(
    next.slideNumber,
    previewPatchForSection(next.sectionId, next.patch),
  );
  return prevKey === nextKey;
}

const DeckSlideItem = memo(function DeckSlideItem({
  slideNumber,
  sectionId,
  patch,
  highlight,
  label,
  emptyLabel,
  bulletinId,
  worshipPlaylistId,
  worshipPlaylistTitle,
  worshipItems,
  worshipFirstSlide,
  worshipLyricsPptxBlobId,
}: DeckSlideItemProps) {
  const slidePatch = useMemo(
    () => previewPatchForSection(sectionId, patch),
    [sectionId, patch],
  );

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
          patch={slidePatch}
          slideLabel={label}
          emptyLabel={emptyLabel}
          lyricsPptxBlobId={worshipLyricsPptxBlobId}
        />
      ) : (
        <BulletinPptSlidePreview
          slideNumber={slideNumber}
          patch={slidePatch}
          requireDate={false}
          emptyLabel={emptyLabel}
          slideLabel={label}
        />
      )}
    </div>
  );
}, deckSlidePropsEqual);

function scrollTargetIntoDeck(
  root: HTMLElement,
  opts: { slide: number; sectionId?: string },
  behavior: ScrollBehavior,
): boolean {
  const target = opts.sectionId
    ? root.querySelector<HTMLElement>(`[data-section="${opts.sectionId}"]`)
    : null;
  const el =
    target ?? root.querySelector<HTMLElement>(`[data-slide="${opts.slide}"]`);
  if (!el) return false;

  // 只在预览列表内滚动，避免 scrollIntoView 把整页/左侧表单顶出视野
  const delta =
    el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
  if (typeof root.scrollTo === 'function') {
    root.scrollTo({ top: Math.max(0, delta), behavior });
  } else {
    root.scrollTop = Math.max(0, delta);
  }
  return true;
}

function runScrollToTarget(root: HTMLElement, opts: { slide: number; sectionId?: string }): void {
  scrollTargetIntoDeck(root, opts, 'auto');
  window.requestAnimationFrame(() => {
    scrollTargetIntoDeck(root, opts, 'auto');
    window.requestAnimationFrame(() => {
      scrollTargetIntoDeck(root, opts, 'smooth');
    });
  });
}

type BulletinFullDeckPreviewProps = {
  bulletin: WeeklyBulletin;
  deckPlan: BulletinDeckPlan | null;
  highlightSlides?: number[];
  highlightSectionId?: string;
  scrollRequest?: BulletinPreviewScrollRequest | null;
  worshipItems?: PlaylistItem[];
  worshipPlaylistTitle?: string;
  onVisibleSlideChange?: (slideNumber: number) => void;
};

export default function BulletinFullDeckPreview({
  bulletin,
  deckPlan,
  highlightSlides = [],
  highlightSectionId = '',
  scrollRequest = null,
  worshipItems = [],
  worshipPlaylistTitle = '',
  onVisibleSlideChange,
}: BulletinFullDeckPreviewProps) {
  const { t } = useI18n();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const scrollSyncUntilRef = useRef(0);
  const highlightSet = useMemo(() => new Set(highlightSlides), [highlightSlides]);

  const worshipFirstSlide = worshipFirstPresentationSlide(deckPlan);

  const composedSections = useMemo(
    () => (deckPlan ? composeDeckSectionsForPreview(deckPlan) : []),
    [deckPlan],
  );

  const fullPatch = useMemo(
    (): BulletinPreviewPatchFields => ({
      serviceDate: bulletin.serviceDate || nextSundayIso(),
      serviceTime: bulletin.serviceTime || '11:00',
      scriptureBook: bulletin.scriptureBook,
      scriptureReference: bulletin.scriptureReference,
      showPreServiceChairName: bulletin.showPreServiceChairName,
      preServiceChairNames: bulletin.preServiceChairNames,
      birthdayMonth: bulletin.birthdayMonth,
      birthdayNames: bulletin.birthdayNames,
      verseOfWeek: bulletin.verseOfWeek,
      hiddenSections: bulletin.hiddenSections,
      skipTestimonyWeek: bulletin.skipTestimonyWeek,
      skipDepartmentReports: bulletin.skipDepartmentReports,
      weeklyMeetingVariant: bulletin.weeklyMeetingVariant,
      slideTextOverrides: bulletin.slideTextOverrides,
    }),
    [
      bulletin.serviceDate,
      bulletin.serviceTime,
      bulletin.scriptureBook,
      bulletin.scriptureReference,
      bulletin.showPreServiceChairName,
      bulletin.preServiceChairNames,
      bulletin.birthdayMonth,
      bulletin.birthdayNames,
      bulletin.verseOfWeek,
      bulletin.hiddenSections,
      bulletin.skipTestimonyWeek,
      bulletin.skipDepartmentReports,
      bulletin.weeklyMeetingVariant,
      bulletin.slideTextOverrides,
    ],
  );

  useEffect(() => {
    if (!scrollRequest || !deckPlan) return;
    const slide = scrollRequest.slide;
    if (slide < 1 || slide > deckPlan.totalSlides) return;

    scrollSyncUntilRef.current = Date.now() + 700;

    const root = scrollRootRef.current;
    if (!root) return;

    const target = { slide, sectionId: scrollRequest.sectionId };
    runScrollToTarget(root, target);

    const retryTimers = [80, 220, 500].map((delay) =>
      window.setTimeout(() => {
        runScrollToTarget(root, target);
        if (delay === 500) {
          scrollSyncUntilRef.current = Date.now() + 200;
        }
      }, delay),
    );

    return () => retryTimers.forEach((timer) => window.clearTimeout(timer));
  }, [scrollRequest?.id, scrollRequest?.slide, scrollRequest?.sectionId, deckPlan]);

  const reportVisibleSlide = useCallback(() => {
    if (!onVisibleSlideChange || Date.now() < scrollSyncUntilRef.current) return;
    const root = scrollRootRef.current;
    if (!root) return;

    const rootRect = root.getBoundingClientRect();
    if (rootRect.height < 8) return;

    const anchorY = rootRect.top + Math.min(160, rootRect.height * 0.28);
    let bestSlide = 0;
    let bestTop = Number.NEGATIVE_INFINITY;
    let fallbackSlide = 0;
    let fallbackDistance = Number.POSITIVE_INFINITY;

    root.querySelectorAll<HTMLElement>('[data-slide]').forEach((el) => {
      const slide = Number(el.dataset.slide);
      if (!slide) return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom <= rootRect.top || rect.top >= rootRect.bottom) return;

      const distance = Math.abs(rect.top + rect.height * 0.2 - anchorY);
      if (distance < fallbackDistance) {
        fallbackDistance = distance;
        fallbackSlide = slide;
      }

      if (rect.top <= anchorY && rect.top >= bestTop) {
        bestTop = rect.top;
        bestSlide = slide;
      }
    });

    onVisibleSlideChange(bestSlide || fallbackSlide || 1);
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
    const initialTimer = window.setTimeout(reportVisibleSlide, 80);
    const settleTimer = window.setTimeout(reportVisibleSlide, 400);

    return () => {
      root.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(initialTimer);
      window.clearTimeout(settleTimer);
    };
  }, [onVisibleSlideChange, reportVisibleSlide, deckPlan]);

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
        {` · ${t('bulletin.previewSectionComposeMeta', { count: composedSections.length })}`}
        {highlightSlides.length > 0 ? ` · ${t('bulletin.previewDeckHighlightNote')}` : ''}
      </p>
      {composedSections.map((section) => {
        const nav = navSectionById(section.id);
        const title = nav ? t(nav.labelKey) : section.id;
        const active = highlightSectionId === section.id;
        return (
          <section
            key={section.id}
            className={`bulletin-deck-section${active ? ' bulletin-deck-section--active' : ''}`}
            data-section={section.id}
          >
            <header className="bulletin-deck-section-header">
              <h3 className="bulletin-deck-section-title">{title}</h3>
              <span className="bulletin-deck-section-pages">
                {t('bulletin.previewSectionPages', { count: section.slides.length })}
              </span>
            </header>
            <div className="bulletin-deck-section-slides">
              {section.slides.map((page) => (
                <DeckSlideItem
                  key={`${section.id}-${page}`}
                  slideNumber={page}
                  sectionId={section.id}
                  patch={fullPatch}
                  highlight={highlightSet.has(page)}
                  label={t('bulletin.previewSlideSingle', { page })}
                  emptyLabel={t('bulletin.coverPreviewEmpty')}
                  bulletinId={bulletin.id}
                  worshipPlaylistId={bulletin.servicePlaylistId}
                  worshipPlaylistTitle={worshipPlaylistTitle}
                  worshipItems={worshipItems}
                  worshipFirstSlide={worshipFirstSlide}
                  worshipLyricsPptxBlobId={bulletin.worshipLyricsPptxBlobId}
                />
              ))}
            </div>
          </section>
        );
      })}
      {highlightSectionId &&
      !composedSections.some((s) => s.id === highlightSectionId) &&
      navSectionById(highlightSectionId) ? (
        <section
          className="bulletin-deck-section bulletin-deck-section--hidden-placeholder"
          data-section={highlightSectionId}
        >
          <header className="bulletin-deck-section-header">
            <h3 className="bulletin-deck-section-title">
              {t(navSectionById(highlightSectionId)!.labelKey)}
            </h3>
          </header>
          <p className="bulletin-deck-section-hidden-hint">{t('bulletin.previewSectionHiddenHint')}</p>
        </section>
      ) : null}
    </div>
  );
}
