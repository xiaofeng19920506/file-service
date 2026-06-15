import { useMemo } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { BULLETIN_WIZARD_STEPS } from '../../lib/bulletin-template-steps';
import BulletinFullDeckPreview from './BulletinFullDeckPreview';

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

  return (
    <div className="bulletin-preview-panel">
      <header className="bulletin-preview-panel-header">
        <h2>{t('bulletin.previewTitle')}</h2>
        <p className="bulletin-preview-panel-hint">{t('bulletin.previewHint')}</p>
      </header>

      <BulletinFullDeckPreview bulletin={bulletin} highlightSlides={highlightSlides} />
    </div>
  );
}
