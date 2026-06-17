import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getBulletinWorshipPlaylist,
  type BulletinSlidePreviewParams,
  type WeeklyBulletin,
} from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import { useI18n } from '../../i18n';
import { buildBulletinDeckPlan, type BulletinDeckPlan } from '../../lib/bulletin-deck-plan';
import { nextSundayIso } from '../../lib/bulletin-date';
import {
  firstSlideForWizardStep,
  slidesForWizardStep,
  wizardStepIndexForSlide,
} from '../../lib/bulletin-template-steps';
import BulletinFullDeckPreview, {
  type BulletinPreviewScrollRequest,
} from './BulletinFullDeckPreview';
import BulletinSlideShowLauncher from './BulletinSlideShowLauncher';

type BulletinPreviewPanelProps = {
  /** 左侧 stepper 当前步骤；滚动目标从本面板 deckPlan 解析 */
  scrollToWizardStep: number;
  /** 再次点击同一 step 时递增，触发重新滚动 */
  scrollToWizardBump?: number;
  /** 显式滚到某一预览页（如封面聚焦） */
  scrollToPresentationSlide?: { slide: number; bump: number } | null;
  highlightWizardStep: number;
  bulletin: WeeklyBulletin;
  worshipRefreshKey?: number;
  onVisibleWizardStepChange?: (stepIndex: number) => void;
};

export default function BulletinPreviewPanel({
  scrollToWizardStep,
  scrollToWizardBump = 0,
  scrollToPresentationSlide = null,
  highlightWizardStep,
  bulletin,
  worshipRefreshKey = 0,
  onVisibleWizardStepChange,
}: BulletinPreviewPanelProps) {
  const { t } = useI18n();
  const [deckPlan, setDeckPlan] = useState<BulletinDeckPlan | null>(null);
  const [scrollRequest, setScrollRequest] = useState<BulletinPreviewScrollRequest>({
    slide: 1,
    id: 0,
  });
  const [worshipItems, setWorshipItems] = useState<PlaylistItem[]>([]);
  const [worshipPlaylistTitle, setWorshipPlaylistTitle] = useState('');

  const requestScroll = useCallback((slide: number) => {
    if (slide < 1) return;
    setScrollRequest((prev) => ({ slide, id: prev.id + 1 }));
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
    bulletin.serviceDate,
    bulletin.serviceTime,
    bulletin.scriptureBook,
    bulletin.scriptureReference,
    bulletin.skipTestimonyWeek,
    bulletin.skipDepartmentReports,
    bulletin.weeklyMeetingVariant,
  ]);

  useEffect(() => {
    if (!deckPlan) return;
    const slide = firstSlideForWizardStep(scrollToWizardStep, deckPlan);
    if (slide != null) requestScroll(slide);
  }, [scrollToWizardStep, scrollToWizardBump, deckPlan, requestScroll]);

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
    () => slidesForWizardStep(highlightWizardStep, deckPlan),
    [highlightWizardStep, deckPlan],
  );

  const handleVisibleSlide = useCallback(
    (slide: number) => {
      onVisibleWizardStepChange?.(wizardStepIndexForSlide(slide, deckPlan));
    },
    [deckPlan, onVisibleWizardStepChange],
  );

  const previewPatch = useMemo(
    (): BulletinSlidePreviewParams => ({
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
        scrollRequest={scrollRequest}
        worshipItems={worshipItems}
        worshipPlaylistTitle={worshipPlaylistTitle}
        onVisibleSlideChange={handleVisibleSlide}
      />
    </div>
  );
}
