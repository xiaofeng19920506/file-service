import { useMemo } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import { BULLETIN_WIZARD_STEPS } from '../../lib/bulletin-template-steps';
import BulletinPptSlidePreview from './BulletinPptSlidePreview';

type BulletinPreviewPanelProps = {
  wizardStep: number;
  bulletin: WeeklyBulletin;
};

export default function BulletinPreviewPanel({ wizardStep, bulletin }: BulletinPreviewPanelProps) {
  const { t } = useI18n();
  const stepDef = BULLETIN_WIZARD_STEPS[wizardStep];
  const slideNumber = stepDef?.slides[0];

  const coverPatch = useMemo(() => {
    if (stepDef?.id !== 'cover') return undefined;
    const serviceDate = bulletin.serviceDate || nextSundayIso();
    return {
      serviceDate,
      serviceTime: bulletin.serviceTime || '11:00',
    };
  }, [stepDef?.id, bulletin.serviceDate, bulletin.serviceTime]);

  if (!stepDef?.slides.length || !slideNumber) {
    return (
      <div className="bulletin-preview-panel">
        <header className="bulletin-preview-panel-header">
          <h2>{t('bulletin.previewTitle')}</h2>
        </header>
        <p className="bulletin-empty">{t('bulletin.coverPreviewEmpty')}</p>
      </div>
    );
  }

  const staticSlides = stepDef.companionStaticSlides ?? [];

  return (
    <div className="bulletin-preview-panel">
      <header className="bulletin-preview-panel-header">
        <h2>{t('bulletin.previewTitle')}</h2>
        <p className="bulletin-preview-panel-hint">{t('bulletin.previewHint')}</p>
      </header>

      <div className="bulletin-preview-stack">
        <BulletinPptSlidePreview
          slideNumber={slideNumber}
          patch={coverPatch}
          requireDate={false}
          emptyLabel={t('bulletin.coverPreviewEmpty')}
          slideLabel={t('bulletin.previewSlideSingle', { page: slideNumber })}
          large
        />

        {staticSlides.map((page) => (
          <div key={page} className="bulletin-preview-static-block">
            <p className="bulletin-preview-static-note">{t('bulletin.previewStaticNote')}</p>
            <BulletinPptSlidePreview
              slideNumber={page}
              requireDate={false}
              emptyLabel={t('bulletin.coverPreviewEmpty')}
              slideLabel={t('bulletin.previewStaticPreService', { page })}
              large
            />
          </div>
        ))}
      </div>
    </div>
  );
}
