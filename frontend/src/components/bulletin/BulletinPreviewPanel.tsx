import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBulletinWorshipPlaylist, type WeeklyBulletin } from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import {
  buildBulletinDeckPlan,
  firstSlideForSection,
  presentationSlidesToSkipInShow,
  sectionIdForSlide,
  slidesForSection,
  type BulletinDeckPlan,
} from '../../lib/bulletin-deck-plan';
import { sectionPptxOverridesKey } from '../../lib/bulletin-preview-patch';
import type { BulletinNavSection } from '../../lib/bulletin-sections';
import BulletinFullDeckPreview, {
  type BulletinPreviewScrollRequest,
} from './BulletinFullDeckPreview';
import type { WorshipPresentationMode } from '../../lib/worship-presentation-mode';

type BulletinPreviewPanelProps = {
  /** 左侧选中的模板分区 id；滚动目标从本面板 deckPlan 解析 */
  scrollToSectionId: string;
  /** 再次点击同一分区时递增，触发重新滚动 */
  scrollToSectionBump?: number;
  /** 显式滚到某一预览页（如封面聚焦） */
  scrollToPresentationSlide?: { slide: number; bump: number } | null;
  /** 正在同步/刷新的分区（仅该区显示 loading，不影响整页） */
  busySectionId?: string | null;
  bulletin: WeeklyBulletin;
  /** 含动态公告的左侧导航，用于预览分区顺序 */
  navOrder?: BulletinNavSection[];
  worshipRefreshKey?: number;
  onVisibleSectionChange?: (sectionId: string) => void;
  /**
   * 预览箭头跨到另一分区时：切换左侧选中分区（与滚动跟随区分，跟随只改高亮）。
   * 调用方勿再 bump 到分区首页；本面板会滚到具体 slide。
   */
  onNavigateToSection?: (sectionId: string) => void;
  /** 供左侧「投影」使用实际页数与跳过页 */
  onDeckMetaChange?: (meta: { totalSlides: number; skipSlides: number[] } | null) => void;
  onWorshipPresentationModeChange?: (mode: WorshipPresentationMode) => void;
};

export default function BulletinPreviewPanel({
  scrollToSectionId,
  scrollToSectionBump = 0,
  scrollToPresentationSlide = null,
  busySectionId = null,
  bulletin,
  navOrder,
  worshipRefreshKey = 0,
  onVisibleSectionChange,
  onNavigateToSection,
  onDeckMetaChange,
  onWorshipPresentationModeChange,
}: BulletinPreviewPanelProps) {
  const [deckPlan, setDeckPlan] = useState<BulletinDeckPlan | null>(null);
  const [planRefreshing, setPlanRefreshing] = useState(false);
  const [scrollRequest, setScrollRequest] = useState<BulletinPreviewScrollRequest>({
    slide: 1,
    id: 0,
  });
  const [worshipItems, setWorshipItems] = useState<PlaylistItem[]>([]);
  const [worshipPlaylistTitle, setWorshipPlaylistTitle] = useState('');

  const requestScroll = useCallback((slide: number, sectionId?: string) => {
    if (slide < 1) return;
    setScrollRequest((prev) => ({ slide, id: prev.id + 1, sectionId }));
  }, []);

  // 用值指纹当依赖：draft 对象引用变化但内容没变时（如 SSE 刷新），不重建 deck，
  // 否则预览列表会被反复重置、后面的页一直停在加载中。
  // 预览 retainHidden：隐藏分区不改 PPT 结构，仅 UI 标「已隐藏」+ 投影 skip。
  // 勿把 hiddenSections 放进 deck-plan 依赖，否则隐藏公告时会重拉 plan，且曾与 PNG 过滤逻辑打架导致页码乱套。
  const sectionPptxKey = sectionPptxOverridesKey(bulletin.sectionPptxOverrides);
  const announcementsStructureKey = (bulletin.announcements ?? [])
    .map((a) => a.id)
    .join(',');
  const bulletinRef = useRef(bulletin);
  bulletinRef.current = bulletin;

  useEffect(() => {
    let cancelled = false;
    let debounceTimer = 0;

    const run = () => {
      setPlanRefreshing(true);
      const snapshot = bulletinRef.current;
      void (async () => {
        try {
          const plan = await buildBulletinDeckPlan(snapshot);
          if (!cancelled) setDeckPlan(plan);
        } catch {
          if (!cancelled) setDeckPlan(null);
        } finally {
          if (!cancelled) setPlanRefreshing(false);
        }
      })();
    };

    // 结构变更才重建 plan；生日名单等内容字段不在 deps 里（见下方）
    debounceTimer = window.setTimeout(run, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅结构相关指纹；内容改动不触发 deck-plan/LO 预热
  }, [
    bulletin.id,
    bulletin.scriptureBook,
    bulletin.scriptureReference,
    bulletin.weeklyMeetingVariant,
    // 条数 + id 顺序影响加页与 remap；正文改动不重建 plan
    announcementsStructureKey,
    sectionPptxKey,
  ]);

  const onDeckMetaChangeRef = useRef(onDeckMetaChange);
  onDeckMetaChangeRef.current = onDeckMetaChange;
  const lastDeckMetaKeyRef = useRef<string>('');

  useEffect(() => {
    const notify = onDeckMetaChangeRef.current;
    if (!notify) return;
    if (!deckPlan) {
      if (lastDeckMetaKeyRef.current === 'null') return;
      lastDeckMetaKeyRef.current = 'null';
      notify(null);
      return;
    }
    const skipSlides = presentationSlidesToSkipInShow(deckPlan, bulletin);
    const key = `${deckPlan.totalSlides}:${skipSlides.join(',')}`;
    if (lastDeckMetaKeyRef.current === key) return;
    lastDeckMetaKeyRef.current = key;
    notify({
      totalSlides: deckPlan.totalSlides,
      skipSlides,
    });
  }, [
    deckPlan,
    bulletin.hiddenSections,
    bulletin.skipTestimonyWeek,
    bulletin.skipDepartmentReports,
  ]);

  // 区分「点击左侧分区」与「预览滚动跟随」：后者也会改 scrollToSectionId，
  // 若照样回滚预览，用户手动下滚会被不断拽回当前分区，永远滚不到后面的页。
  const lastVisibleSectionRef = useRef<string>('');
  const prevScrollBumpRef = useRef(scrollToSectionBump);

  useEffect(() => {
    if (!deckPlan) return;
    const bumpChanged = prevScrollBumpRef.current !== scrollToSectionBump;
    prevScrollBumpRef.current = scrollToSectionBump;
    if (!bumpChanged && scrollToSectionId === lastVisibleSectionRef.current) return;
    const slide = firstSlideForSection(scrollToSectionId, deckPlan);
    if (slide != null) requestScroll(slide, scrollToSectionId);
  }, [scrollToSectionId, scrollToSectionBump, deckPlan, requestScroll]);

  useEffect(() => {
    if (!deckPlan || !scrollToPresentationSlide) return;
    const slide = scrollToPresentationSlide.slide;
    if (slide < 1) return;
    const sectionId = sectionIdForSlide(slide, deckPlan);
    if (sectionId) {
      // 先标记，避免随后 scrollToSectionId 变化又滚回分区首页
      lastVisibleSectionRef.current = sectionId;
      if (sectionId !== scrollToSectionId) {
        onNavigateToSection?.(sectionId);
      } else {
        onVisibleSectionChange?.(sectionId);
      }
    }
    requestScroll(slide, sectionId ?? undefined);
    // 仅 bump 触发；scrollToSectionId 放 deps 会在箭头切分区后重复跑
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollToSectionId 取触发当帧的值
  }, [
    scrollToPresentationSlide?.bump,
    deckPlan,
    requestScroll,
    onNavigateToSection,
    onVisibleSectionChange,
  ]);

  useEffect(() => {
    if (!bulletin.servicePlaylistId) {
      setWorshipItems([]);
      setWorshipPlaylistTitle('');
      return;
    }
    let cancelled = false;
    void getBulletinWorshipPlaylist(bulletin.id)
      .then((data) => {
        if (!cancelled) {
          setWorshipItems(data.items ?? []);
          setWorshipPlaylistTitle(data.playlist?.title ?? '');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorshipItems([]);
          setWorshipPlaylistTitle('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bulletin.id, bulletin.servicePlaylistId, worshipRefreshKey]);

  // 歌单刷新会改敬拜页高度（嵌入播放器），把预览重新对齐到左侧当前分区
  const prevWorshipRefreshKeyRef = useRef(worshipRefreshKey);
  useEffect(() => {
    if (prevWorshipRefreshKeyRef.current === worshipRefreshKey) return;
    prevWorshipRefreshKeyRef.current = worshipRefreshKey;
    if (!deckPlan || worshipRefreshKey <= 0) return;
    const slide = firstSlideForSection(scrollToSectionId, deckPlan);
    if (slide != null) {
      // 等嵌入播放器挂上后再滚，避免高度尚未稳定
      const timers = [0, 120, 320].map((delay) =>
        window.setTimeout(() => requestScroll(slide, scrollToSectionId), delay),
      );
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
  }, [worshipRefreshKey, deckPlan, scrollToSectionId, requestScroll]);

  const highlightSlides = useMemo(
    () => slidesForSection(scrollToSectionId, deckPlan),
    [scrollToSectionId, deckPlan],
  );

  const handleVisibleSlide = useCallback(
    (slide: number) => {
      const sectionId = sectionIdForSlide(slide, deckPlan);
      if (sectionId) {
        lastVisibleSectionRef.current = sectionId;
        onVisibleSectionChange?.(sectionId);
      }
    },
    [deckPlan, onVisibleSectionChange],
  );

  const handleRequestSlide = useCallback(
    (slide: number) => {
      if (!deckPlan || slide < 1) return;
      const sectionId = sectionIdForSlide(slide, deckPlan);
      if (sectionId) {
        // 先标记，避免 scrollToSectionId 变化时又滚回分区首页
        lastVisibleSectionRef.current = sectionId;
        if (sectionId !== scrollToSectionId) {
          // 跨分区：必须切换选中分区，预览才渲染目标页的 DOM
          onNavigateToSection?.(sectionId);
        } else {
          onVisibleSectionChange?.(sectionId);
        }
      }
      requestScroll(slide, sectionId ?? undefined);
    },
    [
      deckPlan,
      onNavigateToSection,
      onVisibleSectionChange,
      requestScroll,
      scrollToSectionId,
    ],
  );

  // 结构变化才整卷 planRefreshing；否则仅当前分区标 loading
  const structureRefreshing =
    planRefreshing &&
    (busySectionId == null ||
      busySectionId === 'scripture' ||
      (typeof busySectionId === 'string' && busySectionId.startsWith('announcement:')) ||
      busySectionId === 'baptism' ||
      busySectionId === 'more' ||
      busySectionId === 'weekly_meetings' ||
      busySectionId === 'staff_meeting' ||
      busySectionId === 'rotation' ||
      busySectionId === 'future_testimony' ||
      busySectionId === 'service_roster' ||
      Boolean(bulletin.sectionPptxOverrides?.[busySectionId ?? '']));

  return (
    <div className="bulletin-preview-panel">
      <BulletinFullDeckPreview
        bulletin={bulletin}
        deckPlan={deckPlan}
        highlightSlides={highlightSlides}
        highlightSectionId={scrollToSectionId}
        busySectionId={busySectionId ?? (structureRefreshing ? scrollToSectionId : null)}
        scrollRequest={scrollRequest}
        navOrder={navOrder}
        worshipItems={worshipItems}
        worshipPlaylistTitle={worshipPlaylistTitle}
        onVisibleSlideChange={handleVisibleSlide}
        onRequestSlide={handleRequestSlide}
        onWorshipPresentationModeChange={onWorshipPresentationModeChange}
      />
    </div>
  );
}
