import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlobContent, uploadFile } from '../../api/client';
import { fetchBulletinTemplateFile, updateBulletin, type WeeklyBulletin } from '../../api/bulletins';
import PptEditor from '../PptEditor/PptEditor';
import { useI18n } from '../../i18n';
import { buildPatchedBulletinForSectionExtract } from '../../lib/bulletin-pptx';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from '../../lib/bulletin-section-visibility';
import { extractSlidesByFileNumbersAsPptx } from '../../lib/pptx-extract-slide';
import { parsePptxSlidesDetailed, revokeSlideUrls } from '../../lib/pptx-preview';
import { navSectionById } from '../../lib/bulletin-sections';
import BulletinCompositeSlide from './BulletinCompositeSlide';

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

  const [sectionFile, setSectionFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState(0);
  const [previewSlides, setPreviewSlides] = useState<
    Awaited<ReturnType<typeof parsePptxSlidesDetailed>>
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [quickEdit, setQuickEdit] = useState(false);

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
      setQuickEdit(false);
      try {
        const file = await loadSectionFile();
        if (cancelled) return;
        const parsed = await parsePptxSlidesDetailed(file, { sourceFile: file.name });
        if (cancelled) {
          revokeSlideUrls(parsed);
          return;
        }
        objectUrl = URL.createObjectURL(file);
        setSectionFile(file);
        setPreviewUrl(objectUrl);
        setSlideCount(parsed.length);
        setPreviewSlides(parsed);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'load_failed');
          setSectionFile(null);
          setPreviewUrl(null);
          setPreviewSlides([]);
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

  useEffect(
    () => () => {
      revokeSlideUrls(previewSlides);
    },
    [previewSlides],
  );

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
    await persistSectionFile(picked);
  };

  if (quickEdit && previewUrl) {
    return (
      <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
        <PptEditor
          title={t('bulletin.editSlidesQuickTitle', { section: sectionLabel })}
          mergedUrl={previewUrl}
          onSaveFile={persistSectionFile}
          onClose={() => setQuickEdit(false)}
        />
      </div>
    );
  }

  return (
    <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
      <div className="bulletin-section-ppt-native">
        <header className="bulletin-section-ppt-native-header">
          <div>
            <h2>{t('bulletin.editSlidesSectionTitle', { section: sectionLabel })}</h2>
            <p className="bulletin-section-ppt-native-intro">{t('bulletin.editSlidesNativeIntro')}</p>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('library.closePreviewTab')}
          </button>
        </header>

        {loading && (
          <div className="preview-empty">
            <div className="preview-spinner" />
            <p>{t('preview.converting')}</p>
          </div>
        )}

        {loadError && (
          <div className="preview-empty">
            <p className="form-error">{loadError}</p>
          </div>
        )}

        {!loading && !loadError && sectionFile && (
          <>
            <ol className="bulletin-section-ppt-native-steps">
              <li>{t('bulletin.editSlidesNativeStep1')}</li>
              <li>{t('bulletin.editSlidesNativeStep2')}</li>
              <li>{t('bulletin.editSlidesNativeStep3')}</li>
            </ol>

            <div className="bulletin-section-ppt-native-actions">
              <button type="button" className="btn-primary" onClick={handleDownload}>
                {t('bulletin.editSlidesDownload')}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? t('bulletin.editSlidesUploading') : t('bulletin.editSlidesUpload')}
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
            </div>

            {uploadError && <p className="form-error">{uploadError}</p>}

            <p className="bulletin-section-ppt-native-meta">
              {t('bulletin.editSlidesNativeMeta', { count: slideCount })}
            </p>

            <div className="bulletin-section-ppt-native-preview" aria-label={t('bulletin.previewTitle')}>
              {previewSlides.slice(0, 4).map((slide) => (
                <BulletinCompositeSlide
                  key={slide.slidePath || slide.index}
                  slide={slide}
                  pptxBlob={sectionFile}
                  emptyLabel={t('preview.slideNumber', { n: slide.index })}
                  slideLabel={t('preview.slideNumber', { n: slide.index })}
                />
              ))}
            </div>

            <div className="bulletin-section-ppt-native-secondary">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setQuickEdit(true)}>
                {t('bulletin.editSlidesQuickOpen')}
              </button>
              <span className="bulletin-section-ppt-native-secondary-hint">
                {t('bulletin.editSlidesQuickHint')}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
