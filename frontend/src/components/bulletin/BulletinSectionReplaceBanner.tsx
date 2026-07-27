import { useRef, useState } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { friendlyError } from '../../lib/error-messages';
import {
  bulletinSectionLabel,
  clearBulletinSectionPptx,
  replaceBulletinSectionPptx,
} from '../../lib/bulletin-section-pptx';
import { useI18n } from '../../i18n';

type Props = {
  sectionId: string;
  draft: WeeklyBulletin;
  onOpenEditor: () => void;
  onSaved: (bulletin: WeeklyBulletin) => void;
};

export default function BulletinSectionReplaceBanner({
  sectionId,
  draft,
  onOpenEditor,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOverride = Boolean(draft.sectionPptxOverrides?.[sectionId]);
  const sectionLabel = bulletinSectionLabel(sectionId, t);

  const handleUpload = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await replaceBulletinSectionPptx(draft, sectionId, file, sectionLabel);
      onSaved(updated);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'upload_failed';
      setError(
        friendlyError(code === 'invalid_pptx' ? 'invalid_pptx' : code, t),
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClear = async () => {
    if (!hasOverride || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await clearBulletinSectionPptx(draft, sectionId);
      onSaved(updated);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulletin-edit-slides-banner">
      <div className="bulletin-edit-slides-banner-actions">
        <button
          type="button"
          className="btn-primary bulletin-edit-slides-banner-btn"
          onClick={onOpenEditor}
          disabled={busy}
        >
          {t('bulletin.editSlidesOpenEditor')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
          hidden
          onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn-secondary bulletin-edit-slides-banner-btn"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? t('bulletin.editSlidesUploading') : t('bulletin.editSlidesReplaceUpload')}
        </button>
        {hasOverride ? (
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void handleClear()}
            title={t('bulletin.editSlidesResetHint')}
          >
            {t('bulletin.editSlidesReset')}
          </button>
        ) : null}
      </div>
      <p className="bulletin-edit-slides-banner-hint">
        {hasOverride
          ? t('bulletin.editSlidesReplacedHint')
          : t('bulletin.editSlidesOpenHint')}
      </p>
      {error ? <p className="error-msg">{error}</p> : null}
    </div>
  );
}
