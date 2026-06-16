import { useMemo } from 'react';
import type { BulletinSlidePreviewParams, WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import { BULLETIN_WIZARD_STEPS } from '../../lib/bulletin-template-steps';
import BulletinFullDeckPreview from './BulletinFullDeckPreview';
import BulletinSlideShowLauncher from './BulletinSlideShowLauncher';

type BulletinPreviewPanelProps = {
  wizardStep: number;
  bulletin: WeeklyBulletin;
};

export default function BulletinPreviewPanel({ wizardStep, bulletin }: BulletinPreviewPanelProps) {
  const { t } = useI18n();
  const stepDef = BULLETIN_WIZARD_STEPS[wizardStep];

  const highlightSlides = useMemo(() => {
    if (!stepDef) return [];
    return [...stepDef.slides, ...(stepDef.companionStaticSlides ?? [])];
  }, [stepDef]);

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

      <BulletinFullDeckPreview bulletin={bulletin} highlightSlides={highlightSlides} />
    </div>
  );
}
