import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlobContent, uploadFile } from '../../api/client';
import { fetchBulletinTemplateFile, updateBulletin, type WeeklyBulletin } from '../../api/bulletins';
import PptEditor from '../PptEditor/PptEditor';
import { useI18n } from '../../i18n';
import { buildPatchedBulletinForSectionExtract } from '../../lib/bulletin-pptx';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from '../../lib/bulletin-section-visibility';
import { extractSlidesByFileNumbersAsPptx } from '../../lib/pptx-extract-slide';
import { navSectionById } from '../../lib/bulletin-sections';
import { pptxSlidesAreWellFormed } from '../../lib/pptx-integrity';

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
  const draftSnapRef = useRef(draft);
  draftSnapRef.current = draft;
  /** 为 true 时跳过已存 override，强制从模板重抽（「恢复原版」） */
  const forceTemplateRef = useRef(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const sectionMeta = navSectionById(sectionId);
  const sectionLabel = sectionMeta ? t(sectionMeta.labelKey) : sectionId;
  const downloadName = `周报-${draft.serviceDate}-${sectionLabel}.pptx`;
  const hasOverride = Boolean(draft.sectionPptxOverrides?.[sectionId]);

  const loadSectionFile = useCallback(async () => {
    const snap = draftSnapRef.current;
    const forceTemplate = forceTemplateRef.current;
    forceTemplateRef.current = false;
    const existingBlobId = forceTemplate ? undefined : snap.sectionPptxOverrides?.[sectionId];
    if (existingBlobId) {
      const blob = await fetchBlobContent(existingBlobId);
      // 早期版本的文本回写会写出坏 XML（整页空白、文字残缺）。这种存档没有价值，
      // 直接按当前 draft 重新生成，用户下次保存即覆盖。
      if (await pptxSlidesAreWellFormed(blob)) {
        return new File([blob], downloadName, { type: PPTX_MIME });
      }
      console.warn(`section pptx override ${existingBlobId} is malformed, rebuilding from draft`);
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
      try {
        const file = await loadSectionFile();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'load_failed');
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
  }, [loadSectionFile, sectionId, reloadToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const persistSectionFile = async (file: File) => {
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
    // 编辑器内存态已由 saveChanges 更新，勿改 previewUrl 以免整页重载
    onSaved({
      ...updated,
      sectionPptxOverrides: updated.sectionPptxOverrides ?? nextOverrides,
    });
  };

  const handleResetToTemplate = async () => {
    if (resetting) return;
    setResetting(true);
    setLoadError(null);
    try {
      const nextOverrides = { ...(draft.sectionPptxOverrides ?? {}) };
      delete nextOverrides[sectionId];
      const updated = await updateBulletin(draft.id, { sectionPptxOverrides: nextOverrides });
      onSaved({
        ...updated,
        sectionPptxOverrides: updated.sectionPptxOverrides ?? nextOverrides,
      });
      forceTemplateRef.current = true;
      setReloadToken((n) => n + 1);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'reset_failed');
    } finally {
      setResetting(false);
    }
  };

  if (loading || resetting) {
    return (
      <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
        <div className="preview-empty">
          <div className="preview-spinner" />
          <p>{resetting ? t('bulletin.editSlidesResetting') : t('preview.converting')}</p>
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
              {t('common.close')}
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
        onResetToTemplate={hasOverride ? handleResetToTemplate : undefined}
      />
    </div>
  );
}
