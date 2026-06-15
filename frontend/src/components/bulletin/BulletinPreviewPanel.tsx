import { useEffect, useState } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { previewStepPptxBlob, previewTemplateSlides } from '../../lib/bulletin-slides';
import { BULLETIN_WIZARD_STEPS } from '../../lib/bulletin-template-steps';
import { fetchBulletinTemplateFile } from '../../api/bulletins';
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
  const [slideIndex, setSlideIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSlideIndex(0);
  }, [wizardStep, bulletin.serviceDate, bulletin.serviceTime]);

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

  const currentSlide = slides[slideIndex] ?? null;

  const slideLabel =
    currentSlide && stepDef?.slides.length
      ? t('bulletin.previewSlideLabel', {
          current: slideIndex + 1,
          total: slides.length,
          page: currentSlide.slideInFile,
        })
      : stepDef?.slides.length
        ? t('bulletin.previewSectionLabel', { pages: stepDef.slides.join(', ') })
        : undefined;

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

      {slides.length > 1 && (
        <div className="bulletin-preview-nav">
          <button
            type="button"
            className="btn-secondary"
            disabled={slideIndex <= 0}
            onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
          >
            {t('bulletin.previewPrev')}
          </button>
          <span className="bulletin-preview-nav-meta">
            {slideIndex + 1} / {slides.length}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={slideIndex >= slides.length - 1}
            onClick={() => setSlideIndex((i) => Math.min(slides.length - 1, i + 1))}
          >
            {t('bulletin.previewNext')}
          </button>
        </div>
      )}
    </div>
  );
}
