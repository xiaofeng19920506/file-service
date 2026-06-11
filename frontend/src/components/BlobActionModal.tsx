import { localizedSongTitle } from '../lib/song-title';
import { formatSize } from '../lib/file-accept';
import { useI18n } from '../i18n';
import type { BlobRecord } from '../types';

type BlobActionModalProps = {
  blob: BlobRecord;
  downloading?: boolean;
  canDownload?: boolean;
  canPreview?: boolean;
  onDownload: () => void;
  onPreview: () => void;
  onClose: () => void;
};

export default function BlobActionModal({
  blob,
  downloading = false,
  canDownload = true,
  canPreview = true,
  onDownload,
  onPreview,
  onClose,
}: BlobActionModalProps) {
  const { t, locale } = useI18n();
  const displayTitle = localizedSongTitle(blob, locale, blob.originalFilename ?? blob.id);
  const readOnly = !canDownload && !canPreview;

  const goLogin = () => {
    window.location.hash = '#/login';
  };

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal blob-action-modal">
        <div className="metadata-modal-header">
          <h3>{t('library.blobActionTitle')}</h3>
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
          {readOnly && <p className="blob-action-guest-hint">{t('library.guestReadOnlyHint')}</p>}
          {!readOnly && <p className="blob-action-intro">{t('library.blobActionIntro')}</p>}
          <div className="blob-action-summary">
            <strong className="blob-action-title">{displayTitle}</strong>
            <div className="blob-action-meta">
              {blob.composer && (
                <span>
                  {t('search.composer')}：{blob.composer}
                </span>
              )}
              {blob.author && (
                <span>
                  {t('search.author')}：{blob.author}
                </span>
              )}
              {blob.originalFilename && (
                <span>
                  {t('search.filename')}：{blob.originalFilename}
                </span>
              )}
              <span>{formatSize(blob.sizeBytes)}</span>
            </div>
          </div>
        </div>

        <div className="metadata-modal-actions blob-action-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('metadata.close')}
          </button>
          {readOnly ? (
            <button type="button" className="btn-primary" onClick={goLogin}>
              {t('auth.login')}
            </button>
          ) : (
            <>
              {canDownload && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={downloading}
                  onClick={onDownload}
                >
                  {downloading ? t('library.downloading') : t('library.download')}
                </button>
              )}
              {canPreview && (
                <button type="button" className="btn-primary" onClick={onPreview}>
                  {t('library.preview')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
