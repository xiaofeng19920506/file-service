import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { nextSundayIso } from '../../lib/bulletin-date';
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
  }, [
    bulletin.id,
    bulletin.scriptureBook,
    bulletin.scriptureReference,
    bulletin.hiddenSections,
    bulletin.skipTestimonyWeek,
    bulletin.skipDepartmentReports,
    bulletin.weeklyMeetingVariant,
  ]);

  useEffect(() => {
    if (!deckPlan) return;
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
      if (sectionId) onVisibleSectionChange?.(sectionId);
    },
    [deckPlan, onVisibleSectionChange],
  );

  const previewPatch = useMemo(
    (): BulletinSlidePreviewParams => ({
      serviceDate: bulletin.serviceDate || nextSundayIso(),
      serviceTime: bulletin.serviceTime || '11:00',
      scriptureBook: bulletin.scriptureBook,
      scriptureReference: bulletin.scriptureReference,
      showPreServiceChairName: bulletin.showPreServiceChairName,
      preServiceChairNames: bulletin.preServiceChairNames,
      hiddenSections: bulletin.hiddenSections,
      weeklyMeetingVariant: bulletin.weeklyMeetingVariant,
    }),
    [
      bulletin.serviceDate,
      bulletin.serviceTime,
      bulletin.scriptureBook,
      bulletin.scriptureReference,
      bulletin.showPreServiceChairName,
      bulletin.preServiceChairNames,
      bulletin.hiddenSections,
      bulletin.weeklyMeetingVariant,
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
