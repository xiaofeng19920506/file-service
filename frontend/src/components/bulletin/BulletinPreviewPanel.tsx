import { useEffect, useMemo, useState } from 'react';
import {
  fetchBulletinTemplateMap,
  getBulletinWorshipPlaylist,
  type BulletinSlidePreviewParams,
  type WeeklyBulletin,
} from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import { useI18n } from '../../i18n';
import { buildBulletinDeckPlan, type BulletinDeckPlan } from '../../lib/bulletin-deck-plan';
import { nextSundayIso } from '../../lib/bulletin-date';
import { slidesForWizardStep } from '../../lib/bulletin-template-steps';
import BulletinFullDeckPreview, {
  type BulletinPreviewScrollRequest,
} from './BulletinFullDeckPreview';
import BulletinSlideShowLauncher from './BulletinSlideShowLauncher';

type BulletinPreviewPanelProps = {
  highlightWizardStep: number;
  bulletin: WeeklyBulletin;
  scrollRequest?: BulletinPreviewScrollRequest | null;
  worshipRefreshKey?: number;
  onVisibleSlideChange?: (slideNumber: number) => void;
  onDeckPlanChange?: (plan: BulletinDeckPlan | null) => void;
};

export default function BulletinPreviewPanel({
  highlightWizardStep,
  bulletin,
  scrollRequest = null,
  worshipRefreshKey = 0,
  onVisibleSlideChange,
  onDeckPlanChange,
}: BulletinPreviewPanelProps) {
  const { t } = useI18n();
  const [deckPlan, setDeckPlan] = useState<BulletinDeckPlan | null>(null);
  const [worshipItems, setWorshipItems] = useState<PlaylistItem[]>([]);
  const [worshipPlaylistTitle, setWorshipPlaylistTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    let debounceTimer = 0;

    const run = () => {
      void (async () => {
        try {
          const map = await fetchBulletinTemplateMap();
          const plan = await buildBulletinDeckPlan(bulletin, map.sections ?? []);
          if (!cancelled) {
            setDeckPlan(plan);
            onDeckPlanChange?.(plan);
          }
        } catch {
          if (!cancelled) {
            setDeckPlan(null);
            onDeckPlanChange?.(null);
          }
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
    onDeckPlanChange,
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

  const highlightSlides = useMemo(
    () => slidesForWizardStep(highlightWizardStep, deckPlan),
    [highlightWizardStep, deckPlan],
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
        onVisibleSlideChange={onVisibleSlideChange}
      />
    </div>
  );
}
