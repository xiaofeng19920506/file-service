import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  previewPatchFull,
  sectionPptxOverridesKey,
  type BulletinPreviewPatchFields,
} from '../../lib/bulletin-preview-patch';
import { navSectionById, type BulletinNavSection } from '../../lib/bulletin-sections';
import { upcomingSundayIso } from '../../lib/bulletin-date';
import {
  bulletinDynamicTextOverrides,
  bulletinDynamicTextOverridesKey,
  mergeSlideTextOverrides,
} from '../../lib/bulletin-pptx-patches';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';
import BulletinWorshipEmbeddedPlayer from './BulletinWorshipEmbeddedPlayer';
import { normalizeWorshipPresentationMode, type WorshipPresentationMode } from '../../lib/worship-presentation-mode';

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
  /** 相邻分区：低优先级提前一点点加载 */
  prefetch: boolean;
  bulletinId: string;
  worshipPlaylistId: string | null;
  worshipPlaylistTitle: string;
  worshipItems: PlaylistItem[];
  worshipFirstSlide: number | null;
  worshipLyricsPptxBlobId: string | null;
  worshipPresentationMode: string;
  onWorshipPresentationModeChange?: (mode: WorshipPresentationMode) => void;
};

function deckSlidePropsEqual(prev: DeckSlideItemProps, next: DeckSlideItemProps): boolean {
  if (
    prev.slideNumber !== next.slideNumber ||
    prev.sectionId !== next.sectionId ||
    prev.highlight !== next.highlight ||
    prev.prefetch !== next.prefetch ||
    prev.bulletinId !== next.bulletinId ||
    prev.worshipPlaylistId !== next.worshipPlaylistId ||
    prev.worshipPlaylistTitle !== next.worshipPlaylistTitle ||
    prev.worshipFirstSlide !== next.worshipFirstSlide ||
    prev.worshipLyricsPptxBlobId !== next.worshipLyricsPptxBlobId ||
    prev.worshipPresentationMode !== next.worshipPresentationMode ||
    prev.onWorshipPresentationModeChange !== next.onWorshipPresentationModeChange ||
    prev.worshipItems !== next.worshipItems
  ) {
    return false;
  }
  const prevKey = bulletinPreviewCacheKey(
    prev.slideNumber,
    previewPatchFull(prev.patch),
    prev.sectionId,
  );
  const nextKey = bulletinPreviewCacheKey(
    next.slideNumber,
    previewPatchFull(next.patch),
    next.sectionId,
  );
  return prevKey === nextKey;
}

const DeckSlideItem = memo(function DeckSlideItem({
  slideNumber,
  sectionId,
  patch,
  highlight,
  prefetch,
  bulletinId,
  worshipPlaylistId,
  worshipPlaylistTitle,
  worshipItems,
  worshipFirstSlide,
  worshipLyricsPptxBlobId,
  worshipPresentationMode,
  onWorshipPresentationModeChange,
}: DeckSlideItemProps) {
  const slidePatch = useMemo(() => previewPatchFull(patch), [patch]);
  const presentationMode = normalizeWorshipPresentationMode(worshipPresentationMode);

  const showWorshipDock =
    worshipFirstSlide != null && slideNumber === worshipFirstSlide;

  // 一律懒加载：视口内升 high；当前分区近距也 high；相邻分区 low，避免抢带宽
  const priority = highlight ? 'high' : prefetch ? 'low' : 'normal';
  const rootMargin = highlight ? '280px 0px' : prefetch ? '420px 0px' : '140px 0px';

  return (
    <div
      className={`bulletin-deck-slide${highlight ? ' bulletin-deck-slide--highlight' : ''}${showWorshipDock ? ' bulletin-deck-slide--worship' : ''}`}
      data-slide={slideNumber}
      data-section-slide={sectionId}
    >
      <BulletinPptSlidePreview
        slideNumber={slideNumber}
        patch={slidePatch}
        sectionId={sectionId}
        lazy={!highlight}
        priority={priority}
        rootMargin={rootMargin}
      />
      {showWorshipDock ? (
        <BulletinWorshipEmbeddedPlayer
          bulletinId={bulletinId}
          playlistId={worshipPlaylistId}
          playlistTitle={worshipPlaylistTitle}
          items={worshipItems}
          lyricsPptxBlobId={worshipLyricsPptxBlobId}
          presentationMode={presentationMode}
          onPresentationModeChange={onWorshipPresentationModeChange}
        />
      ) : null}
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
  /** 当前编辑/选中的分区：预览只显示该分区幻灯片 */
  highlightSectionId?: string;
  /** 仅该分区显示同步/刷新 loading，其它分区保持现有预览 */
  busySectionId?: string | null;
  scrollRequest?: BulletinPreviewScrollRequest | null;
  /** 左侧动态导航顺序（含 announcement:<id>）；用于预览分区编排 */
  navOrder?: BulletinNavSection[];
  worshipItems?: PlaylistItem[];
  worshipPlaylistTitle?: string;
  onVisibleSlideChange?: (slideNumber: number) => void;
  /** 箭头翻页：可跨分区，由外层切换选中分区并滚动到目标页 */
  onRequestSlide?: (slideNumber: number) => void;
  onWorshipPresentationModeChange?: (mode: WorshipPresentationMode) => void;
};

export default function BulletinFullDeckPreview({
  bulletin,
  deckPlan,
  highlightSlides = [],
  highlightSectionId = '',
  busySectionId = null,
  scrollRequest = null,
  navOrder,
  worshipItems = [],
  worshipPlaylistTitle = '',
  onVisibleSlideChange,
  onRequestSlide,
  onWorshipPresentationModeChange,
}: BulletinFullDeckPreviewProps) {
  const { t } = useI18n();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const scrollSyncUntilRef = useRef(0);
  const highlightSet = useMemo(() => new Set(highlightSlides), [highlightSlides]);

  const worshipFirstSlide = worshipFirstPresentationSlide(deckPlan);

  const allComposedSections = useMemo(
    () => (deckPlan ? composeDeckSectionsForPreview(deckPlan, navOrder) : []),
    [deckPlan, navOrder],
  );

  const composedSections = useMemo(() => {
    if (!highlightSectionId) return allComposedSections.slice(0, 1);
    const filtered = allComposedSections.filter((section) => section.id === highlightSectionId);
    if (filtered.length) return filtered;
    // compose 漏排时仍显示 deck 里有的页（如动态公告后的本週聚会）
    const direct = deckPlan?.sections.find(
      (section) => section.id === highlightSectionId && section.slides.length,
    );
    return direct ? [{ id: direct.id, slides: [...direct.slides] }] : filtered;
  }, [allComposedSections, highlightSectionId, deckPlan]);

  const sectionSlides = useMemo(
    () => composedSections.flatMap((section) => section.slides),
    [composedSections],
  );

  /** 整卷可翻页顺序（箭头跨分区）；禁用仅在整卷首尾 */
  const deckSlides = useMemo(
    () => allComposedSections.flatMap((section) => section.slides),
    [allComposedSections],
  );

  const [visibleSlide, setVisibleSlide] = useState(1);

  useEffect(() => {
    if (sectionSlides.length === 0) return;
    setVisibleSlide((prev) => (sectionSlides.includes(prev) ? prev : sectionSlides[0]!));
  }, [sectionSlides]);

  const prefetchSectionIds = useMemo(() => {
    const set = new Set<string>();
    if (highlightSectionId) set.add(highlightSectionId);
    else if (composedSections[0]) set.add(composedSections[0].id);
    return set;
  }, [composedSections, highlightSectionId]);

  const dynamicOverridesKey = bulletinDynamicTextOverridesKey(bulletin);
  const fullPatch = useMemo(
    (): BulletinPreviewPatchFields => ({
      serviceDate: bulletin.serviceDate || upcomingSundayIso(),
      serviceTime: bulletin.serviceTime || '11:00',
      scriptureBook: bulletin.scriptureBook,
      scriptureReference: bulletin.scriptureReference,
      showPreServiceChairName: bulletin.showPreServiceChairName,
      preServiceChairNames: bulletin.preServiceChairNames,
      birthdayMonth: bulletin.birthdayMonth,
      birthdayNames: bulletin.birthdayNames,
      verseOfWeek: bulletin.verseOfWeek,
      announcements: (bulletin.announcements ?? []).map((a) => ({
        id: a.id,
        title: a.title ?? '',
        body: a.body,
      })),
      hiddenSections: bulletin.hiddenSections,
      skipTestimonyWeek: bulletin.skipTestimonyWeek,
      skipDepartmentReports: bulletin.skipDepartmentReports,
      weeklyMeetingVariant: bulletin.weeklyMeetingVariant,
      // 奉献/浸礼/见证/名单等字段也并入覆盖；公告走 announcements 加页
      slideTextOverrides: mergeSlideTextOverrides(
        bulletinDynamicTextOverrides(bulletin),
        bulletin.slideTextOverrides,
      ),
      bulletinId: bulletin.id,
      sectionPptxKey: sectionPptxOverridesKey(bulletin.sectionPptxOverrides),
    }),
    [
      bulletin.id,
      bulletin.serviceDate,
      bulletin.serviceTime,
      bulletin.scriptureBook,
      bulletin.scriptureReference,
      bulletin.showPreServiceChairName,
      bulletin.preServiceChairNames,
      bulletin.birthdayMonth,
      bulletin.birthdayNames,
      bulletin.verseOfWeek,
      bulletin.announcements,
      bulletin.hiddenSections,
      bulletin.skipTestimonyWeek,
      bulletin.skipDepartmentReports,
      bulletin.weeklyMeetingVariant,
      bulletin.slideTextOverrides,
      bulletin.sectionPptxOverrides,
      dynamicOverridesKey,
    ],
  );

  // 切换分区时先回到顶部，避免上一分区的 scrollTop 落在空内容上
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || !highlightSectionId) return;
    root.scrollTop = 0;
  }, [highlightSectionId]);

  useEffect(() => {
    if (!scrollRequest || !deckPlan) return;
    const slide = scrollRequest.slide;
    if (slide < 1 || slide > deckPlan.totalSlides) return;

    setVisibleSlide(slide);
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
    if (Date.now() < scrollSyncUntilRef.current) return;
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

    const slide = bestSlide || fallbackSlide || 1;
    setVisibleSlide(slide);
    onVisibleSlideChange?.(slide);
  }, [onVisibleSlideChange]);

  const goToSlide = useCallback(
    (slide: number) => {
      if (!deckPlan || slide < 1) return;
      setVisibleSlide(slide);
      if (onRequestSlide) {
        onRequestSlide(slide);
        return;
      }
      scrollSyncUntilRef.current = Date.now() + 700;
      onVisibleSlideChange?.(slide);
      const root = scrollRootRef.current;
      if (!root) return;
      const target = { slide, sectionId: highlightSectionId || undefined };
      runScrollToTarget(root, target);
      window.setTimeout(() => runScrollToTarget(root, target), 80);
      window.setTimeout(() => runScrollToTarget(root, target), 220);
      window.setTimeout(() => {
        scrollSyncUntilRef.current = Date.now() + 120;
      }, 500);
    },
    [deckPlan, highlightSectionId, onRequestSlide, onVisibleSlideChange],
  );

  const slideIndex = deckSlides.indexOf(visibleSlide);
  const effectiveIndex = slideIndex >= 0 ? slideIndex : 0;
  const canPrev = deckSlides.length > 0 && effectiveIndex > 0;
  const canNext = deckSlides.length > 0 && effectiveIndex < deckSlides.length - 1;

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || !deckPlan) return;

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
  }, [reportVisibleSlide, deckPlan, sectionSlides]);

  if (!deckPlan) {
    return (
      <div className="bulletin-deck-preview bulletin-deck-preview--loading-plan">
        <div className="preview-spinner" />
        <p>{t('bulletin.previewPlanLoading')}</p>
      </div>
    );
  }

  return (
    <div className="bulletin-deck-preview-shell">
      <div ref={scrollRootRef} className="bulletin-deck-preview bulletin-deck-preview--current-section">
        {composedSections.map((section) => {
          const sectionBusy = busySectionId === section.id;
          return (
            <section
              key={section.id}
              className={`bulletin-deck-section bulletin-deck-section--active${
                sectionBusy ? ' bulletin-deck-section--busy' : ''
              }`}
              data-section={section.id}
            >
              {sectionBusy ? (
                <div className="bulletin-deck-section-busy-banner" role="status">
                  <span className="preview-spinner bulletin-section-syncing-spinner" />
                  {t('bulletin.sectionPreviewRefreshing')}
                </div>
              ) : null}
              <div className="bulletin-deck-section-slides">
                {section.slides.map((page) => (
                  <DeckSlideItem
                    key={`${section.id}-${page}`}
                    slideNumber={page}
                    sectionId={section.id}
                    patch={fullPatch}
                    highlight={highlightSet.has(page)}
                    prefetch={prefetchSectionIds.has(section.id)}
                    bulletinId={bulletin.id}
                    worshipPlaylistId={bulletin.servicePlaylistId}
                    worshipPlaylistTitle={worshipPlaylistTitle}
                    worshipItems={worshipItems}
                    worshipFirstSlide={worshipFirstSlide}
                    worshipLyricsPptxBlobId={bulletin.worshipLyricsPptxBlobId}
                    worshipPresentationMode={bulletin.worshipPresentationMode}
                    onWorshipPresentationModeChange={onWorshipPresentationModeChange}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {highlightSectionId &&
        !allComposedSections.some((s) => s.id === highlightSectionId) &&
        navSectionById(highlightSectionId, navOrder) ? (
          <section
            className="bulletin-deck-section bulletin-deck-section--hidden-placeholder"
            data-section={highlightSectionId}
          >
            <p className="bulletin-deck-section-hidden-hint">{t('bulletin.previewSectionHiddenHint')}</p>
          </section>
        ) : null}
      </div>

      {deckSlides.length > 0 ? (
        <>
          {canPrev ? (
            <button
              type="button"
              className="bulletin-deck-nav bulletin-deck-nav--prev"
              aria-label={t('bulletin.previewPrev')}
              onClick={() => goToSlide(deckSlides[effectiveIndex - 1]!)}
            >
              <ChevronLeftIcon />
            </button>
          ) : null}
          {canNext ? (
            <button
              type="button"
              className="bulletin-deck-nav bulletin-deck-nav--next"
              aria-label={t('bulletin.previewNext')}
              onClick={() => goToSlide(deckSlides[effectiveIndex + 1]!)}
            >
              <ChevronRightIcon />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
