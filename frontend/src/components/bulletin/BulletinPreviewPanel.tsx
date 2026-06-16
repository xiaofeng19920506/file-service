import { useMemo, useState } from 'react';
import type { BulletinSlidePreviewParams, WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import { BULLETIN_WIZARD_STEPS } from '../../lib/bulletin-template-steps';
import BulletinFullDeckPreview from './BulletinFullDeckPreview';
import BulletinSlideShow from './BulletinSlideShow';

type BulletinPreviewPanelProps = {
  wizardStep: number;
  bulletin: WeeklyBulletin;
};

export default function BulletinPreviewPanel({ wizardStep, bulletin }: BulletinPreviewPanelProps) {
  const { t } = useI18n();
  const [slideShowOpen, setSlideShowOpen] = useState(false);
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
          <button
            type="button"
            className="btn-primary bulletin-slideshow-start"
            onClick={() => setSlideShowOpen(true)}
          >
            {t('bulletin.startSlideShow')}
          </button>
        </div>
      </header>

      <BulletinFullDeckPreview bulletin={bulletin} highlightSlides={highlightSlides} />

      <BulletinSlideShow
        open={slideShowOpen}
        onClose={() => setSlideShowOpen(false)}
        initialSlide={highlightSlides[0] ?? 1}
        patch={previewPatch}
      />
    </div>
  );
}
