import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlobContent, uploadFile } from '../../api/client';
import { fetchBulletinTemplateFile, updateBulletin, type WeeklyBulletin } from '../../api/bulletins';
import PptEditor from '../PptEditor/PptEditor';
import { useI18n } from '../../i18n';
import { buildPatchedBulletinForSectionExtract } from '../../lib/bulletin-pptx';
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

function triggerDownload(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function BulletinSectionPptEditor({
  sectionId,
  draft,
  onClose,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftSnapRef = useRef(draft);
  draftSnapRef.current = draft;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sectionFile, setSectionFile] = useState<File | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const sectionMeta = navSectionById(sectionId);
  const sectionLabel = sectionMeta ? t(sectionMeta.labelKey) : sectionId;
  const downloadName = `周报-${draft.serviceDate}-${sectionLabel}.pptx`;

  const loadSectionFile = useCallback(async () => {
    const snap = draftSnapRef.current;
    const existingBlobId = snap.sectionPptxOverrides?.[sectionId];
    if (existingBlobId) {
      const blob = await fetchBlobContent(existingBlobId);
      return new File([blob], downloadName, { type: PPTX_MIME });
    }
    const slideNums = BULLETIN_SECTION_TEMPLATE_SLIDES[sectionId];
    if (!slideNums?.length) throw new Error('section_has_no_slides');
    const template = await fetchBulletinTemplateFile();
    const patched = await buildPatchedBulletinForSectionExtract(template, snap);
    const bytes = await extractSlidesByFileNumbersAsPptx(patched, slideNums);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new File([copy.buffer], downloadName, { type: PPTX_MIME });
  }, [downloadName, sectionId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      setUploadError(null);
      try {
        const file = await loadSectionFile();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file);
        setSectionFile(file);
        setPreviewUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'load_failed');
          setSectionFile(null);
          setPreviewUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [loadSectionFile, sectionId]);

  const persistSectionFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const named = new File([file], downloadName, { type: PPTX_MIME });
      const uploaded = await uploadFile(named, {
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
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'upload_failed');
      throw e;
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = () => {
    if (!sectionFile) return;
    triggerDownload(new File([sectionFile], downloadName, { type: PPTX_MIME }));
  };

  const handleUploadPick = async (list: FileList | null) => {
    const picked = list?.[0];
    if (!picked) return;
    const name = picked.name.toLowerCase();
    if (!name.endsWith('.pptx')) {
      setUploadError(t('bulletin.editSlidesNeedPptx'));
      return;
    }
    try {
      await persistSectionFile(picked);
      onClose();
    } catch {
      /* uploadError already set */
    }
  };

  if (loading) {
    return (
      <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
        <div className="preview-empty">
          <div className="preview-spinner" />
          <p>{t('preview.converting')}</p>
        </div>
      </div>
    );
  }

  if (loadError || !previewUrl) {
    return (
      <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
        <div className="bulletin-section-ppt-native">
          <header className="bulletin-section-ppt-native-header">
            <h2>{t('bulletin.editSlidesSectionTitle', { section: sectionLabel })}</h2>
            <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
              {t('library.closePreviewTab')}
            </button>
          </header>
          <p className="form-error">{loadError ?? t('preview.emptyFile')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
      <PptEditor
        title={t('bulletin.editSlidesSectionTitle', { section: sectionLabel })}
        mergedUrl={previewUrl}
        onSaveFile={persistSectionFile}
        onClose={onClose}
        onDownload={handleDownload}
        canDownload={!!sectionFile}
      />
      <div className="bulletin-section-ppt-native-secondary bulletin-section-ppt-editor-extra">
        <p className="bulletin-section-ppt-native-secondary-hint">{t('bulletin.editSlidesWebHint')}</p>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? t('bulletin.editSlidesUploading') : t('bulletin.editSlidesUploadNative')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          hidden
          onChange={(e) => {
            const files = e.target.files;
            e.target.value = '';
            void handleUploadPick(files);
          }}
        />
        {uploadError && <p className="form-error">{uploadError}</p>}
      </div>
    </div>
  );
}
