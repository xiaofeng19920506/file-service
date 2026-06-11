import { useState } from 'react';
import { updateBlobMetadata } from '../api/client';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';
import type { MetadataConflict, MetadataField, MetadataSnapshot } from '../types';

type MetadataConflictModalProps = {
  blobId: string;
  filename: string;
  contentFingerprint: string;
  existing: MetadataSnapshot;
  conflicts: MetadataConflict[];
  incoming: MetadataSnapshot;
  onClose: () => void;
  onResolved: () => void;
};

const FIELD_KEYS: MetadataField[] = [
  'titleZhCn',
  'titleZhTw',
  'titleEn',
  'composer',
  'author',
  'notes',
];

export default function MetadataConflictModal({
  blobId,
  filename,
  contentFingerprint,
  existing,
  conflicts,
  incoming,
  onClose,
  onResolved,
}: MetadataConflictModalProps) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conflictFields = new Set(conflicts.map((c) => c.field));

  const resolveKeepExisting = () => {
    onResolved();
    onClose();
  };

  const resolveUseIncoming = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateBlobMetadata(
        blobId,
        {
          titleEn: incoming.titleEn ?? undefined,
          titleZhCn: incoming.titleZhCn ?? undefined,
          titleZhTw: incoming.titleZhTw ?? undefined,
          composer: incoming.composer ?? undefined,
          author: incoming.author ?? undefined,
          notes: incoming.notes ?? undefined,
        },
        { overwrite: true },
      );
      onResolved();
      onClose();
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : 'metadata_update_failed', t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal metadata-conflict-modal">
        <div className="metadata-modal-header">
          <h3>{t('library.conflictTitle')}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label={t('metadata.close')}>
            ×
          </button>
        </div>
        <div className="metadata-modal-body">
          <p className="conflict-intro">{t('library.conflictIntro')}</p>
          <p className="conflict-file-meta">
            <span>{filename}</span>
            <span className="content-fingerprint" title={t('library.fingerprintHint')}>
              {t('library.fingerprint', { hash: contentFingerprint })}
            </span>
          </p>

          <div className="metadata-compare-grid">
            <div className="metadata-compare-col">
              <h4>{t('library.existingMetadata')}</h4>
              {FIELD_KEYS.map((field) => (
                <div key={field} className="metadata-compare-row">
                  <span className="metadata-compare-label">{t(`metadata.${field}`)}</span>
                  <span className={conflictFields.has(field) ? 'metadata-conflict-value' : ''}>
                    {existing[field] || '—'}
                  </span>
                </div>
              ))}
            </div>
            <div className="metadata-compare-col">
              <h4>{t('library.incomingMetadata')}</h4>
              {FIELD_KEYS.map((field) => (
                <div key={field} className="metadata-compare-row">
                  <span className="metadata-compare-label">{t(`metadata.${field}`)}</span>
                  <span className={conflictFields.has(field) ? 'metadata-conflict-value' : ''}>
                    {incoming[field] || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}
        </div>
        <div className="metadata-modal-actions metadata-conflict-actions">
          <button type="button" className="btn-secondary" disabled={saving} onClick={resolveKeepExisting}>
            {t('library.keepExisting')}
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void resolveUseIncoming()}>
            {saving ? t('library.savingMetadata') : t('library.useIncoming')}
          </button>
        </div>
      </div>
    </div>
  );
}
