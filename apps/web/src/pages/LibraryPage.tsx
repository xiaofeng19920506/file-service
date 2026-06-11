import { useCallback, useEffect, useRef, useState } from 'react';
import { checkBlobExists, downloadBlobContent, openBlobPreviewTab } from '../api/client';
import BlobActionModal from '../components/BlobActionModal';
import UploadConfirmModal from '../components/UploadConfirmModal';
import { formatContentFingerprint } from '../lib/content-fingerprint';
import { ACCEPT, formatSize, isAcceptedFile } from '../lib/file-accept';
import { useDebouncedBlobSearch } from '../hooks/useDebouncedBlobSearch';
import { DEFAULT_METADATA, type UploadMetadata } from '../hooks/useMergeWorkspace';
import { useLibraryUpload } from '../hooks/useLibraryUpload';
import LibraryLayout from '../components/LibraryLayout';
import { SearchIcon, UploadIcon } from '../components/icons';
import { sha256Hex } from '../lib/file-hash';
import { friendlyError } from '../lib/error-messages';
import { localizedSongTitle } from '../lib/song-title';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import type { BlobRecord } from '../types';

export default function LibraryPage() {
  const { t, locale } = useI18n();
  const { permissions } = useAuth();
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [confirmMetadata, setConfirmMetadata] = useState<UploadMetadata>(DEFAULT_METADATA);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    setSearchError,
    hasSearched,
    searchNow,
  } = useDebouncedBlobSearch();

  const [selectedBlob, setSelectedBlob] = useState<BlobRecord | null>(null);
  const [downloading, setDownloading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { items, error, uploadSummary, uploadFiles, clearCompleted, setError } = useLibraryUpload();

  const updateConfirmMetadata = useCallback((field: keyof UploadMetadata, value: string) => {
    setConfirmMetadata((prev) => ({ ...prev, [field]: value }));
  }, []);

  const stageFiles = useCallback(
    async (raw: FileList | File[]) => {
      const all = Array.from(raw).filter((f) => f.size > 0);
      const accepted = all.filter(isAcceptedFile);
      const rejected = all.filter((f) => !isAcceptedFile(f));

      if (rejected.length) {
        setError(
          t('errors.skipped_files', {
            count: rejected.length,
            names: rejected.map((f) => f.name).join('、'),
          }),
        );
      }
      if (!accepted.length) return;

      setCheckingDuplicate(true);
      setError(null);
      try {
        const duplicateNames: string[] = [];
        await Promise.all(
          accepted.map(async (file) => {
            const hash = await sha256Hex(file);
            const exists = await checkBlobExists(hash);
            if (exists) duplicateNames.push(file.name);
          }),
        );

        if (duplicateNames.length) {
          setError(
            t('errors.content_already_exists_files', {
              names: duplicateNames.join('、'),
            }),
          );
          return;
        }

        setPendingFiles(accepted);
        setConfirmMetadata(DEFAULT_METADATA);
      } catch (e) {
        setError(friendlyError(e instanceof Error ? e.message : 'upload_failed', t));
      } finally {
        setCheckingDuplicate(false);
      }
    },
    [setError, t],
  );

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void stageFiles(e.target.files);
    e.target.value = '';
  };

  const onUploadDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setUploadDragging(false);
    if (e.dataTransfer.files.length) void stageFiles(e.dataTransfer.files);
  };

  const cancelUploadConfirm = () => {
    setPendingFiles(null);
    setConfirmMetadata(DEFAULT_METADATA);
  };

  const confirmUpload = () => {
    if (!pendingFiles?.length) return;
    const files = pendingFiles;
    const metadata = confirmMetadata;
    setPendingFiles(null);
    setConfirmMetadata(DEFAULT_METADATA);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    void uploadFiles(files, metadata);
  };

  useEffect(() => {
    const active = items.some((i) => i.status === 'uploading' || i.status === 'queued');
    const hasErrors = items.some((i) => i.status === 'error');
    if (items.length > 0 && !active && !hasErrors) {
      clearCompleted();
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }, [items, clearCompleted]);

  const handleDownloadBlob = useCallback(async () => {
    if (!selectedBlob) return;
    setDownloading(true);
    try {
      const filename = selectedBlob.originalFilename ?? `${selectedBlob.id}.pptx`;
      await downloadBlobContent(selectedBlob.id, filename);
      setSelectedBlob(null);
    } catch (e) {
      setSearchError(friendlyError(e instanceof Error ? e.message : 'download_failed', t));
    } finally {
      setDownloading(false);
    }
  }, [selectedBlob, t]);

  const handlePreviewBlob = useCallback(() => {
    if (!selectedBlob) return;
    const title = localizedSongTitle(
      selectedBlob,
      locale,
      selectedBlob.originalFilename ?? selectedBlob.id,
    );
    openBlobPreviewTab(selectedBlob.id, title);
    setSelectedBlob(null);
  }, [selectedBlob, locale]);

  const completedUploads = items.filter((i) => i.status === 'done');
  const activeUploads = items.filter((i) => i.status === 'uploading' || i.status === 'queued');

  return (
    <LibraryLayout>
      <div className="library-workflow-grid">
      <section className="workflow-section workflow-search">
        <div className="search-box">
          <div className="search-input-wrap">
            <SearchIcon />
            <input
              type="text"
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  searchNow();
                }
              }}
              placeholder={t('search.placeholder')}
            />
          </div>
          <button
            type="button"
            className="btn-primary btn-search"
            onClick={searchNow}
            disabled={searchLoading}
          >
            {searchLoading ? t('search.searching') : t('search.button')}
          </button>
        </div>
        {searchError && <p className="error-msg">{searchError}</p>}
        {!searchLoading && hasSearched && searchResults.length === 0 && !searchError && (
          <p className="search-empty">{t('search.noResults')}</p>
        )}
        {hasSearched && searchResults.length > 0 && (
          <ul className="search-results">
            {searchResults.map((blob) => {
              const displayTitle = localizedSongTitle(
                blob,
                locale,
                blob.originalFilename ?? blob.id,
              );
              return (
                <li key={blob.id}>
                  <button
                    type="button"
                    className="search-result-item search-result-button"
                    onClick={() => setSelectedBlob(blob)}
                  >
                  <div className="search-result-main">
                    <strong className="search-result-title">{displayTitle}</strong>
                    <div className="search-result-meta">
                      {blob.composer && (
                        <span className="meta-tag">
                          {t('search.composer')}：{blob.composer}
                        </span>
                      )}
                      {blob.author && (
                        <span className="meta-tag">
                          {t('search.author')}：{blob.author}
                        </span>
                      )}
                      {blob.originalFilename && blob.originalFilename !== displayTitle && (
                        <span className="meta-tag meta-tag-muted">
                          {t('search.filename')}：{blob.originalFilename}
                        </span>
                      )}
                      {blob.contentSha256 && (
                        <span
                          className="meta-tag meta-tag-muted content-fingerprint"
                          title={t('library.fingerprintHint')}
                        >
                          {t('library.fingerprint', {
                            hash: formatContentFingerprint(blob.contentSha256),
                          })}
                        </span>
                      )}
                    </div>
                    {blob.notes && <p className="search-result-notes">{blob.notes}</p>}
                  </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {permissions.canUpload && (
      <section className="workflow-section workflow-upload">
        <label
          className={`upload-label ${uploadDragging ? 'dragging' : ''} ${checkingDuplicate ? 'checking' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!checkingDuplicate) setUploadDragging(true);
          }}
          onDragLeave={() => setUploadDragging(false)}
          onDrop={onUploadDrop}
        >
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={checkingDuplicate}
            onChange={onPickFiles}
          />
          <div className="upload-area">
            <UploadIcon />
            <span className="upload-title">
              {checkingDuplicate ? t('upload.checkingDuplicate') : t('upload.title')}
            </span>
          </div>
        </label>
      </section>
      )}
      </div>

      {selectedBlob && (
        <BlobActionModal
          blob={selectedBlob}
          downloading={downloading}
          canDownload={permissions.canDownload}
          canPreview={permissions.canDownload}
          onDownload={() => void handleDownloadBlob()}
          onPreview={handlePreviewBlob}
          onClose={() => setSelectedBlob(null)}
        />
      )}

      {permissions.canUpload && pendingFiles && pendingFiles.length > 0 && (
        <UploadConfirmModal
          files={pendingFiles}
          metadata={confirmMetadata}
          onMetadataChange={updateConfirmMetadata}
          onConfirm={confirmUpload}
          onCancel={cancelUploadConfirm}
        />
      )}

      {(permissions.canUpload && (error || uploadSummary || items.length > 0)) && (
        <section className="library-upload-status">
          {error && <p className="error-msg">{error}</p>}

          {uploadSummary && (
            <div className="upload-summary" aria-live="polite">
              <div className="upload-summary-head">
                <span className="upload-summary-text">
                  {t('upload.summary', { count: uploadSummary.active })}
                  {uploadSummary.queued > 0 &&
                    t('upload.summaryQueued', { queued: uploadSummary.queued })}
                </span>
                <span className="upload-summary-percent">{uploadSummary.percent}%</span>
              </div>
              <div className="upload-summary-bar progress-bar">
                <div className="progress-fill" style={{ width: `${uploadSummary.percent}%` }} />
              </div>
            </div>
          )}

          {items.length > 0 && (
            <ul className="library-upload-list">
              {items.map((item) => (
                <li key={item.id} className={`library-upload-item status-${item.status}`}>
                  <div className="library-upload-main">
                    <strong>{item.title?.trim() || item.file.name}</strong>
                    <span className="library-upload-detail">
                      {item.status === 'queued' && t('files.queued')}
                      {item.status === 'uploading' &&
                        t('files.uploading', { percent: item.progress })}
                      {item.status === 'error' && item.error}
                      {item.status === 'done' && item.sha256 && (
                        <span className="library-upload-fingerprint">
                          {t('library.fingerprint', {
                            hash: formatContentFingerprint(item.sha256),
                          })}
                        </span>
                      )}
                      {item.status === 'done' &&
                        t('library.savedNew', { size: formatSize(item.file.size) })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(completedUploads.length > 0 || items.some((i) => i.status === 'error')) &&
            activeUploads.length === 0 && (
            <div className="library-upload-actions">
              <button type="button" className="btn-secondary" onClick={clearCompleted}>
                {t('library.clearCompleted')}
              </button>
            </div>
          )}
        </section>
      )}

    </LibraryLayout>
  );
}
