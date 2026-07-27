import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlobContent } from '../../api/client';
import { fetchBulletinTemplateFile, type WeeklyBulletin } from '../../api/bulletins';
import PptEditor from '../PptEditor/PptEditor';
import { useI18n } from '../../i18n';
import { buildPatchedBulletinForSectionExtract } from '../../lib/bulletin-pptx';
import {
  bulletinSectionLabel,
  clearBulletinSectionPptx,
  replaceBulletinSectionPptx,
} from '../../lib/bulletin-section-pptx';
import { BULLETIN_SECTION_TEMPLATE_SLIDES } from '../../lib/bulletin-section-visibility';
import { friendlyError } from '../../lib/error-messages';
import { extractSlidesByFileNumbersAsPptx } from '../../lib/pptx-extract-slide';
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
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const sectionLabel = bulletinSectionLabel(sectionId, t);
  const downloadName = `周报-${draft.serviceDate}-${sectionLabel}.pptx`;
  const hasOverride = Boolean(draft.sectionPptxOverrides?.[sectionId]);

  const loadSectionFile = useCallback(async () => {
    const snap = draftSnapRef.current;
    const forceTemplate = forceTemplateRef.current;
    forceTemplateRef.current = false;
    const existingBlobId = forceTemplate ? undefined : snap.sectionPptxOverrides?.[sectionId];
    if (existingBlobId) {
      const blob = await fetchBlobContent(existingBlobId);
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
          setLoadError(friendlyError(e instanceof Error ? e.message : 'load_failed', t));
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
  }, [loadSectionFile, sectionId, reloadToken, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const persistSectionFile = async (file: File) => {
    const updated = await replaceBulletinSectionPptx(draft, sectionId, file, sectionLabel);
    onSaved(updated);
  };

  const handleResetToTemplate = async () => {
    if (resetting) return;
    setResetting(true);
    setLoadError(null);
    try {
      const updated = await clearBulletinSectionPptx(draft, sectionId);
      onSaved(updated);
      forceTemplateRef.current = true;
      setReloadToken((n) => n + 1);
    } catch (e) {
      setLoadError(friendlyError(e instanceof Error ? e.message : 'reset_failed', t));
    } finally {
      setResetting(false);
    }
  };

  const handleReplaceUpload = async (file: File | null) => {
    if (!file || replacing) return;
    setReplacing(true);
    setLoadError(null);
    try {
      const updated = await replaceBulletinSectionPptx(draft, sectionId, file, sectionLabel);
      onSaved(updated);
      setReloadToken((n) => n + 1);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'upload_failed';
      setLoadError(friendlyError(code === 'invalid_pptx' ? 'invalid_pptx' : code, t));
    } finally {
      setReplacing(false);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  if (loading || resetting || replacing) {
    return (
      <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
        <div className="preview-empty">
          <div className="preview-spinner" />
          <p>
            {replacing
              ? t('bulletin.editSlidesUploading')
              : resetting
                ? t('bulletin.editSlidesResetting')
                : t('preview.converting')}
          </p>
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
          <div className="bulletin-section-ppt-native-actions">
            <input
              ref={replaceInputRef}
              type="file"
              accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              hidden
              onChange={(e) => void handleReplaceUpload(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => replaceInputRef.current?.click()}
            >
              {t('bulletin.editSlidesReplaceUpload')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bulletin-section-ppt-overlay" role="dialog" aria-modal="true">
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        hidden
        onChange={(e) => void handleReplaceUpload(e.target.files?.[0] ?? null)}
      />
      <PptEditor
        title={t('bulletin.editSlidesSectionTitle', { section: sectionLabel })}
        mergedUrl={previewUrl}
        onSaveFile={persistSectionFile}
        onResetToTemplate={hasOverride ? handleResetToTemplate : undefined}
        onUploadReplace={() => replaceInputRef.current?.click()}
        onClose={onClose}
      />
    </div>
  );
}
