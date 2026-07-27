import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBulletinWorshipPlaylist,
  type BulletinSlidePreviewParams,
  type WeeklyBulletin,
} from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import { useI18n } from '../../i18n';
import {
  buildBulletinDeckPlan,
  firstSlideForSection,
  sectionIdForSlide,
  slidesForSection,
  type BulletinDeckPlan,
} from '../../lib/bulletin-deck-plan';
import { upcomingSundayIso } from '../../lib/bulletin-date';
import {
  previewPatchFull,
  sectionPptxOverridesKey,
} from '../../lib/bulletin-preview-patch';
import {
  bulletinDynamicTextOverrides,
  mergeSlideTextOverrides,
} from '../../lib/bulletin-pptx-patches';
import BulletinFullDeckPreview, {
  type BulletinPreviewScrollRequest,
} from './BulletinFullDeckPreview';
import BulletinSlideShowLauncher from './BulletinSlideShowLauncher';

type BulletinPreviewPanelProps = {
  /** 左侧选中的模板分区 id；滚动目标从本面板 deckPlan 解析 */
  scrollToSectionId: string;
  /** 再次点击同一分区时递增，触发重新滚动 */
  scrollToSectionBump?: number;
  /** 显式滚到某一预览页（如封面聚焦） */
  scrollToPresentationSlide?: { slide: number; bump: number } | null;
  /** 预览高亮的分区 id */
  highlightSectionId: string;
  bulletin: WeeklyBulletin;
  worshipRefreshKey?: number;
  onVisibleSectionChange?: (sectionId: string) => void;
};

export default function BulletinPreviewPanel({
  scrollToSectionId,
  scrollToSectionBump = 0,
  scrollToPresentationSlide = null,
  highlightSectionId,
  bulletin,
  worshipRefreshKey = 0,
  onVisibleSectionChange,
}: BulletinPreviewPanelProps) {
  const { t } = useI18n();
  const [deckPlan, setDeckPlan] = useState<BulletinDeckPlan | null>(null);
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
  const hiddenSectionsKey = (bulletin.hiddenSections ?? []).join(',');
  const slideTextOverridesKey = JSON.stringify(bulletin.slideTextOverrides ?? []);
  const sectionPptxKey = sectionPptxOverridesKey(bulletin.sectionPptxOverrides);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer = 0;

    const run = () => {
      void (async () => {
        try {
          const plan = await buildBulletinDeckPlan(bulletin);
          if (!cancelled) setDeckPlan(plan);
        } catch {
          if (!cancelled) setDeckPlan(null);
        }
      })();
    };

    debounceTimer = window.setTimeout(run, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bulletin 以下方值指纹为准
  }, [
    bulletin.id,
    bulletin.scriptureBook,
    bulletin.scriptureReference,
    bulletin.birthdayMonth,
    bulletin.birthdayNames,
    bulletin.verseOfWeek,
    hiddenSectionsKey,
    bulletin.skipTestimonyWeek,
    bulletin.skipDepartmentReports,
    bulletin.weeklyMeetingVariant,
    slideTextOverridesKey,
    sectionPptxKey,
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
    requestScroll(scrollToPresentationSlide.slide);
  }, [scrollToPresentationSlide?.bump, deckPlan, requestScroll, scrollToPresentationSlide]);


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

  const highlightSlides = useMemo(
    () => slidesForSection(highlightSectionId, deckPlan),
    [highlightSectionId, deckPlan],
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

  const previewPatch = useMemo(
    (): BulletinSlidePreviewParams =>
      previewPatchFull({
        serviceDate: bulletin.serviceDate || upcomingSundayIso(),
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
      bulletin.hiddenSections,
      bulletin.skipTestimonyWeek,
      bulletin.skipDepartmentReports,
      bulletin.weeklyMeetingVariant,
      bulletin.slideTextOverrides,
      bulletin.sectionPptxOverrides,
      bulletin.lastWeekOfferingDate,
      bulletin.announcements,
      bulletin.baptismText,
      bulletin.testimonyShareDate,
      bulletin.serviceRosterText,
    ],
  );

  return (
    <div className="bulletin-preview-panel">
      <header className="bulletin-preview-panel-header">
        <div className="bulletin-preview-panel-header-row">
          <div>
            <h2>{t('bulletin.previewTitle')}</h2>
            <p className="bulletin-preview-panel-hint">{t('bulletin.previewHint')}</p>
          </div>
          <BulletinSlideShowLauncher
            patch={previewPatch}
            initialSlide={highlightSlides[0] ?? 1}
            totalSlides={deckPlan?.totalSlides}
            className="btn-primary bulletin-slideshow-start"
          />
        </div>
      </header>

      <BulletinFullDeckPreview
        bulletin={bulletin}
        deckPlan={deckPlan}
        highlightSlides={highlightSlides}
        highlightSectionId={highlightSectionId}
        scrollRequest={scrollRequest}
        worshipItems={worshipItems}
        worshipPlaylistTitle={worshipPlaylistTitle}
        onVisibleSlideChange={handleVisibleSlide}
      />
    </div>
  );
}
