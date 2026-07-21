import { useEffect, useMemo, useState } from 'react';
import {
  fetchBulletinSlideTextRuns,
  updateBulletin,
  type SlideTextOverride,
  type WeeklyBulletin,
} from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from '../../lib/bulletin-section-visibility';
import { mergeSectionSlideTextOverrides } from '../../lib/bulletin-slide-text-overrides';

type RunDraft = {
  textIndex: number;
  templateText: string;
  text: string;
};

type SlideDraft = {
  slide: number;
  runs: RunDraft[];
  loading: boolean;
  error: string | null;
};

export type BulletinEditSlidesModalProps = {
  sectionId: string;
  draft: WeeklyBulletin;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
  onSaved: (overrides: SlideTextOverride[]) => void;
};

export function BulletinEditSlidesModal({
  sectionId,
  draft,
  canEdit,
  open,
  onClose,
  onSaved,
}: BulletinEditSlidesModalProps) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<SlideDraft[]>([]);

  const slideNumbers = useMemo(
    () => [...(BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId] ?? [])],
    [sectionId],
  );

  useEffect(() => {
    if (!open || !slideNumbers.length) return;
    let cancelled = false;
    const existing = new Map(
      (draft.slideTextOverrides ?? []).map((o) => [`${o.slide}:${o.textIndex}`, o.text] as const),
    );

    setSlides(
      slideNumbers.map((slide) => ({
        slide,
        runs: [],
        loading: true,
        error: null,
      })),
    );
    setError(null);

    void (async () => {
      const next: SlideDraft[] = [];
      for (const slide of slideNumbers) {
        try {
          const { runs } = await fetchBulletinSlideTextRuns(slide);
          if (cancelled) return;
          next.push({
            slide,
            loading: false,
            error: null,
            runs: runs.map((r) => ({
              textIndex: r.textIndex,
              templateText: r.text,
              text: existing.get(`${slide}:${r.textIndex}`) ?? r.text,
            })),
          });
        } catch (err) {
          if (cancelled) return;
          next.push({
            slide,
            runs: [],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (!cancelled) setSlides(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, slideNumbers, draft.slideTextOverrides]);

  if (!open) return null;

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const sectionOverrides: SlideTextOverride[] = [];
      for (const slide of slides) {
        for (const run of slide.runs) {
          if (run.text === run.templateText) continue;
          sectionOverrides.push({
            slide: slide.slide,
            textIndex: run.textIndex,
            text: run.text,
          });
        }
      }
      const merged = mergeSectionSlideTextOverrides(
        draft.slideTextOverrides,
        sectionId,
        sectionOverrides,
      );
      const updated = await updateBulletin(draft.id, { slideTextOverrides: merged });
      onSaved(updated.slideTextOverrides ?? merged);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulletin-edit-slides-title"
      onClick={() => !saving && onClose()}
    >
      <div className="metadata-modal bulletin-edit-slides-modal" onClick={(e) => e.stopPropagation()}>
        <div className="metadata-modal-header">
          <h3 id="bulletin-edit-slides-title">{t('bulletin.editSlidesTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            disabled={saving}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <div className="metadata-modal-body">
          <p className="bulletin-edit-slides-hint">{t('bulletin.editSlidesHint')}</p>
          {!slideNumbers.length ? (
            <p className="playlists-muted">{t('bulletin.editSlidesEmpty')}</p>
          ) : null}
          {slides.map((slide) => (
            <section key={slide.slide} className="bulletin-edit-slides-section">
              <h4>{t('bulletin.editSlidesPage', { page: String(slide.slide) })}</h4>
              {slide.loading ? (
                <p className="playlists-muted">{t('bulletin.editSlidesLoading')}</p>
              ) : null}
              {slide.error ? <p className="form-error">{slide.error}</p> : null}
              {!slide.loading && !slide.error && !slide.runs.length ? (
                <p className="playlists-muted">{t('bulletin.editSlidesEmpty')}</p>
              ) : null}
              {slide.runs.map((run) => (
                <label key={`${slide.slide}-${run.textIndex}`} className="bulletin-field">
                  <span className="bulletin-edit-slides-run-label">
                    {t('bulletin.editSlidesRun', { index: String(run.textIndex + 1) })}
                  </span>
                  <textarea
                    rows={Math.min(6, Math.max(2, run.text.split('\n').length))}
                    value={run.text}
                    disabled={!canEdit || saving}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSlides((prev) =>
                        prev.map((s) =>
                          s.slide !== slide.slide
                            ? s
                            : {
                                ...s,
                                runs: s.runs.map((r) =>
                                  r.textIndex === run.textIndex ? { ...r, text: value } : r,
                                ),
                              },
                        ),
                      );
                    }}
                  />
                </label>
              ))}
            </section>
          ))}
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <div className="metadata-modal-actions">
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canEdit || saving || slides.some((s) => s.loading)}
            onClick={() => void handleSave()}
          >
            {saving ? t('bulletin.saving') : t('bulletin.editSlidesSave')}
          </button>
        </div>
      </div>
    </div>
  );
}

type BulletinEditSlidesControlProps = {
  sectionId: string;
  draft: WeeklyBulletin;
  canEdit: boolean;
  onSaved: (overrides: SlideTextOverride[]) => void;
};

/** 编辑面板内的「修改幻灯片」按钮 */
export default function BulletinEditSlidesControl({
  sectionId,
  draft,
  canEdit,
  onSaved,
}: BulletinEditSlidesControlProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasSlides = Boolean(BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId]?.length);

  if (!hasSlides) return null;

  return (
    <>
      <button
        type="button"
        className="btn-primary bulletin-edit-slides-btn"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
      >
        {t('bulletin.editSlides')}
      </button>
      <BulletinEditSlidesModal
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={onSaved}
      />
    </>
  );
}
