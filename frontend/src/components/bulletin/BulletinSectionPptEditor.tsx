import { useEffect, useRef, useState } from 'react';
import { fetchBlobContent, uploadFile } from '../../api/client';
import { updateBulletin, type WeeklyBulletin } from '../../api/bulletins';
import PptEditor from '../PptEditor/PptEditor';
import { useI18n } from '../../i18n';
import { buildBulletinPptxFile } from '../../lib/bulletin-publish';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from '../../lib/bulletin-section-visibility';
import { extractSlidesByFileNumbersAsPptx } from '../../lib/pptx-extract-slide';
import { navSectionById } from '../../lib/bulletin-sections';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

type Props = {
  sectionId: string;
  draft: WeeklyBulletin;
  onClose: () => void;
  onSaved: (bulletin: WeeklyBulletin) => void;
};

export default function BulletinSectionPptEditor({
  sectionId,
  draft,
  onClose,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const draftSnapRef = useRef(draft);
  draftSnapRef.current = draft;

  const sectionMeta = navSectionById(sectionId);
  const sectionLabel = sectionMeta ? t(sectionMeta.labelKey) : sectionId;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const snap = draftSnapRef.current;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const existingBlobId = snap.sectionPptxOverrides?.[sectionId];
        let file: File;
        if (existingBlobId) {
          const blob = await fetchBlobContent(existingBlobId);
          file = new File([blob], `section-${sectionId}.pptx`, { type: PPTX_MIME });
        } else {
          const slideNums = BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId];
          if (!slideNums?.length) throw new Error('section_has_no_slides');
          const forExtract: WeeklyBulletin = {
            ...snap,
            sectionPptxOverrides: Object.fromEntries(
              Object.entries(snap.sectionPptxOverrides ?? {}).filter(([id]) => id !== sectionId),
            ),
          };
          const full = await buildBulletinPptxFile(forExtract);
          const bytes = await extractSlidesByFileNumbersAsPptx(full, slideNums);
          const copy = new Uint8Array(bytes.byteLength);
          copy.set(bytes);
          file = new File([copy.buffer], `section-${sectionId}.pptx`, { type: PPTX_MIME });
        }
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file);
        setMergedUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'load_failed');
          setMergedUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sectionId]);

  const handleSaveFile = async (file: File) => {
    const uploaded = await uploadFile(file, {
      title: `周报分区 ${sectionLabel} ${draft.serviceDate}`,
      notes: `bulletin section pptx ${draft.id} ${sectionId}`,
    });
    const nextOverrides = {
      ...(draft.sectionPptxOverrides ?? {}),
      [sectionId]: uploaded.blobId,
    };
    const updated = await updateBulletin(draft.id, { sectionPptxOverrides: nextOverrides });
    onSaved({
      ...updated,
      sectionPptxOverrides: updated.sectionPptxOverrides ?? nextOverrides,
    });
  };

  return (
    <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
      {loading && (
        <div className="preview-empty">
          <div className="preview-spinner" />
          <p>{t('preview.converting')}</p>
        </div>
      )}
      {loadError && (
        <div className="preview-empty">
          <p className="form-error">{loadError}</p>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('library.closePreviewTab')}
          </button>
        </div>
      )}
      {!loading && !loadError && mergedUrl && (
        <PptEditor
          title={t('bulletin.editSlidesSectionTitle', { section: sectionLabel })}
          mergedUrl={mergedUrl}
          onSaveFile={handleSaveFile}
          onClose={onClose}
        />
      )}
    </div>
  );
}
