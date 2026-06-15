import { useEffect, useMemo, useState } from 'react';
import { fetchBulletinTemplateFile } from '../../api/bulletins';
import type { WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { previewStepPptxBlob, previewTemplateSlides } from '../../lib/bulletin-slides';
import { BULLETIN_WIZARD_STEPS } from '../../lib/bulletin-template-steps';
import type { EditableSlide } from '../../lib/pptx-preview';
import BulletinCompositeSlide from './BulletinCompositeSlide';

type BulletinPreviewPanelProps = {
  wizardStep: number;
  bulletin: WeeklyBulletin;
};

export default function BulletinPreviewPanel({ wizardStep, bulletin }: BulletinPreviewPanelProps) {
  const { t } = useI18n();
  const stepDef = BULLETIN_WIZARD_STEPS[wizardStep];
  const [slides, setSlides] = useState<EditableSlide[]>([]);
  const [pptxBlob, setPptxBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);

  const slideLabel = useMemo(() => {
    if (!stepDef?.slides.length) return undefined;
    if (stepDef.slides.length === 1) {
      return t('bulletin.previewSlideSingle', { page: stepDef.slides[0]! });
    }
    return t('bulletin.previewSectionLabel', { pages: stepDef.slides.join(', ') });
  }, [stepDef, t]);

  useEffect(() => {
    if (!stepDef) {
      setSlides([]);
      setPptxBlob(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const loadSlides = stepDef.slides.length
        ? previewTemplateSlides(stepDef.slides)
        : Promise.resolve([]);
      const loadBlob =
        stepDef.enabled && stepDef.slides.length
          ? previewStepPptxBlob(stepDef.id, bulletin)
          : fetchBulletinTemplateFile();

      void Promise.all([loadSlides, loadBlob])
        .then(([result, blob]) => {
          if (!cancelled) {
            setSlides(result);
            setPptxBlob(blob);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSlides([]);
            setPptxBlob(null);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [stepDef, bulletin]);

  const currentSlide = slides[0] ?? null;

  return (
    <div className="bulletin-preview-panel">
      <header className="bulletin-preview-panel-header">
        <h2>{t('bulletin.previewTitle')}</h2>
        <p className="bulletin-preview-panel-hint">{t('bulletin.previewHint')}</p>
      </header>

      <BulletinCompositeSlide
        slide={currentSlide}
        pptxBlob={pptxBlob}
        loading={loading}
        emptyLabel={t('bulletin.coverPreviewEmpty')}
        slideLabel={slideLabel}
        large
      />
    </div>
  );
}
