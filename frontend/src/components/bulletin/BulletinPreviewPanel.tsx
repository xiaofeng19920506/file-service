import { useEffect, useMemo, useState } from 'react';
import { getBulletinWorshipPlaylist, type BulletinSlidePreviewParams, type WeeklyBulletin } from '../../api/bulletins';
import type { PlaylistItem } from '../../api/playlists';
import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import { BULLETIN_WIZARD_STEPS } from '../../lib/bulletin-template-steps';
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
};

export default function BulletinPreviewPanel({
  highlightWizardStep,
  bulletin,
  scrollRequest = null,
  worshipRefreshKey = 0,
  onVisibleSlideChange,
}: BulletinPreviewPanelProps) {
  const { t } = useI18n();
  const highlightStepDef = BULLETIN_WIZARD_STEPS[highlightWizardStep];
  const [worshipItems, setWorshipItems] = useState<PlaylistItem[]>([]);
  const [worshipPlaylistTitle, setWorshipPlaylistTitle] = useState('');

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

  const highlightSlides = useMemo(() => {
    if (!highlightStepDef) return [];
    return [...highlightStepDef.slides, ...(highlightStepDef.companionStaticSlides ?? [])];
  }, [highlightStepDef]);

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
        highlightSlides={highlightSlides}
        scrollRequest={scrollRequest}
        worshipItems={worshipItems}
        worshipPlaylistTitle={worshipPlaylistTitle}
        onVisibleSlideChange={onVisibleSlideChange}
      />
    </div>
  );
}
