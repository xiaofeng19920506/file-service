import { useRef, useState } from 'react';
import { updateBlobContent, updateBlobMetadata, deleteBlob } from '../api/client';
import BlobAuditInfo from './BlobAuditInfo';
import SongTitleFields from './SongTitleFields';
import { ACCEPT, formatSize, isAcceptedFile } from '../lib/file-accept';
import { formatContentFingerprint } from '../lib/content-fingerprint';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';
import type { BlobRecord } from '../types';

type EditLibraryEntryModalProps = {
  blob: BlobRecord;
  onClose: () => void;
  onSaved: (updated: BlobRecord) => void;
  onDeleted?: (blobId: string) => void;
};

export default function EditLibraryEntryModal({
  blob,
  onClose,
  onSaved,
  onDeleted,
}: EditLibraryEntryModalProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [titleZhCn, setTitleZhCn] = useState(blob.titleZhCn ?? blob.title ?? '');
  const [titleZhTw, setTitleZhTw] = useState(blob.titleZhTw ?? '');
  const [titleEn, setTitleEn] = useState(blob.titleEn ?? '');
  const [composer, setComposer] = useState(blob.composer ?? '');
  const [author, setAuthor] = useState(blob.author ?? '');
  const [notes, setNotes] = useState(blob.notes ?? '');
  const [savingMeta, setSavingMeta] = useState(false);
  const [replacingFile, setReplacingFile] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState(blob.contentSha256 ?? '');
  const [sizeBytes, setSizeBytes] = useState(blob.sizeBytes);
  const [filename, setFilename] = useState(blob.originalFilename ?? '');
  const [createdAt] = useState(blob.createdAt);
  const [updatedAt, setUpdatedAt] = useState(blob.updatedAt ?? null);
  const [uploadedBy] = useState(blob.uploadedBy ?? null);
  const [updatedBy, setUpdatedBy] = useState(blob.updatedBy ?? null);

  const titleValue = { titleZhCn, titleZhTw, titleEn };
  const onTitleChange = (field: keyof typeof titleValue, value: string) => {
    if (field === 'titleZhCn') setTitleZhCn(value);
    if (field === 'titleZhTw') setTitleZhTw(value);
    if (field === 'titleEn') setTitleEn(value);
  };

  const saveMetadata = async () => {
    setSavingMeta(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await updateBlobMetadata(
        blob.id,
        {
          titleZhCn: titleZhCn.trim() || undefined,
          titleZhTw: titleZhTw.trim() || undefined,
          titleEn: titleEn.trim() || undefined,
          composer: composer.trim() || undefined,
          author: author.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        { overwrite: true },
      );
      setUpdatedAt(result.updatedAt);
      setUpdatedBy(result.updatedBy);
      const updated: BlobRecord = {
        ...blob,
        titleZhCn: titleZhCn.trim() || null,
        titleZhTw: titleZhTw.trim() || null,
        titleEn: titleEn.trim() || null,
        title: titleZhCn.trim() || titleZhTw.trim() || titleEn.trim() || null,
        composer: composer.trim() || null,
        author: author.trim() || null,
        notes: notes.trim() || null,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
      };
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : 'metadata_update_failed', t));
    } finally {
      setSavingMeta(false);
    }
  };

  const onPickReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAcceptedFile(file)) {
      setError(t('errors.skipped_files', { count: 1, names: file.name }));
      return;
    }
    setReplacingFile(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await updateBlobContent(blob.id, file);
      setFingerprint(result.sha256);
      setSizeBytes(result.sizeBytes);
      setFilename(file.name);
      setUpdatedAt(result.updatedAt);
      setUpdatedBy(result.updatedBy);
      onSaved({
        ...blob,
        contentSha256: result.sha256,
        sizeBytes: result.sizeBytes,
        originalFilename: file.name,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
      });
      setSuccess(t('library.editFileReplaced'));
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'upload_failed', t));
    } finally {
      setReplacingFile(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleted) return;
    const title =
      titleZhCn.trim() || titleZhTw.trim() || titleEn.trim() || filename || blob.id;
    if (!window.confirm(t('admin.deleteConfirm', { title }))) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteBlob(blob.id);
      onDeleted(blob.id);
      onClose();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'delete_failed', t));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal edit-library-modal">
        <div className="metadata-modal-header">
          <h3>{t('library.editTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('metadata.close')}
          >
            ×
          </button>
        </div>

        <div className="metadata-modal-body">
          <p className="edit-library-file-line">
            <span>{filename || blob.id}</span>
            <span className="edit-library-size">{formatSize(sizeBytes)}</span>
            {fingerprint && (
              <span className="content-fingerprint" title={t('library.fingerprintHint')}>
                {t('library.fingerprint', { hash: formatContentFingerprint(fingerprint) })}
              </span>
            )}
          </p>

          <BlobAuditInfo
            createdAt={createdAt}
            updatedAt={updatedAt}
            uploadedBy={uploadedBy}
            updatedBy={updatedBy}
          />

          <div className="metadata-grid metadata-grid-with-titles">
            <div className="metadata-grid-titles">
              <SongTitleFields value={titleValue} onChange={onTitleChange} />
            </div>
            <label className="metadata-field">
              <span>{t('metadata.composer')}</span>
              <input
                type="text"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder={t('metadata.composerPlaceholder')}
              />
            </label>
            <label className="metadata-field">
              <span>{t('metadata.author')}</span>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder={t('metadata.authorPlaceholder')}
              />
            </label>
            <label className="metadata-field metadata-field-notes">
              <span>{t('metadata.notes')}</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('metadata.notesPlaceholder')}
                rows={4}
              />
            </label>
          </div>

          <div className="edit-library-replace">
            <h4>{t('library.replaceFile')}</h4>
            <p className="edit-library-replace-hint">{t('library.replaceFileHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="edit-library-file-input"
              onChange={(e) => void onPickReplaceFile(e)}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={replacingFile}
              onClick={() => fileInputRef.current?.click()}
            >
              {replacingFile ? t('library.replacingFile') : t('library.replaceFile')}
            </button>
          </div>

          {onDeleted && (
            <div className="edit-library-delete">
              <h4>{t('admin.deleteSection')}</h4>
              <p className="edit-library-delete-hint">{t('admin.deleteHint')}</p>
              <button
                type="button"
                className="btn-danger"
                disabled={deleting || replacingFile || savingMeta}
                onClick={() => void handleDelete()}
              >
                {deleting ? t('admin.deleting') : t('admin.delete')}
              </button>
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}
          {success && <p className="success-msg">{success}</p>}
        </div>

        <div className="metadata-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={savingMeta}
            onClick={() => void saveMetadata()}
          >
            {savingMeta ? t('library.savingMetadata') : t('library.saveMetadata')}
          </button>
        </div>
      </div>
    </div>
  );
}
