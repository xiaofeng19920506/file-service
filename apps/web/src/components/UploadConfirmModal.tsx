import SongTitleFields from './SongTitleFields';
import { formatSize } from '../lib/file-accept';
import { hasAnySongTitle } from '../lib/song-title';
import { useI18n } from '../i18n';
import type { UploadMetadata } from '../hooks/useMergeWorkspace';

type UploadConfirmModalProps = {
  files: File[];
  metadata: UploadMetadata;
  onMetadataChange: (field: keyof UploadMetadata, value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function UploadConfirmModal({
  files,
  metadata,
  onMetadataChange,
  onConfirm,
  onCancel,
}: UploadConfirmModalProps) {
  const { t } = useI18n();
  const titleReady = hasAnySongTitle(metadata);

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal upload-confirm-modal">
        <div className="metadata-modal-header">
          <h3>{t('library.uploadConfirmTitle')}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            aria-label={t('metadata.close')}
          >
            ×
          </button>
        </div>

        <div className="metadata-modal-body">
          <p className="upload-confirm-intro">{t('library.uploadConfirmIntro')}</p>

          <ul className="upload-confirm-files">
            {files.map((file) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                <span className="upload-confirm-filename">{file.name}</span>
                <span className="upload-confirm-size">{formatSize(file.size)}</span>
              </li>
            ))}
          </ul>

          <div className="metadata-grid metadata-grid-with-titles">
            <div className="metadata-grid-titles">
              <SongTitleFields
                value={metadata}
                onChange={(field, value) => onMetadataChange(field, value)}
              />
            </div>
            <label className="metadata-field">
              <span>{t('metadata.composer')}</span>
              <input
                type="text"
                value={metadata.composer}
                onChange={(e) => onMetadataChange('composer', e.target.value)}
                placeholder={t('metadata.composerPlaceholder')}
              />
            </label>
            <label className="metadata-field">
              <span>{t('metadata.author')}</span>
              <input
                type="text"
                value={metadata.author}
                onChange={(e) => onMetadataChange('author', e.target.value)}
                placeholder={t('metadata.authorPlaceholder')}
              />
            </label>
            <label className="metadata-field metadata-field-notes">
              <span>{t('metadata.notes')}</span>
              <textarea
                value={metadata.notes}
                onChange={(e) => onMetadataChange('notes', e.target.value)}
                placeholder={t('metadata.notesPlaceholder')}
                rows={4}
              />
            </label>
          </div>

          {!titleReady && (
            <p className="upload-confirm-hint">{t('library.uploadConfirmTitleRequired')}</p>
          )}
        </div>

        <div className="metadata-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t('library.uploadConfirmCancel')}
          </button>
          <button type="button" className="btn-primary" disabled={!titleReady} onClick={onConfirm}>
            {t('library.uploadConfirmSubmit')}
          </button>
        </div>
      </div>
    </div>
  );
}
