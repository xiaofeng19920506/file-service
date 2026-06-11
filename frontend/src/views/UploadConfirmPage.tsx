import { useCallback, useEffect, useMemo, useState } from 'react';
import UploadMetadataForm from '../components/UploadMetadataForm';
import { PptCanvasSlide, PptSlidesPane } from '../components/PptEditor/SlideViews';
import { formatSize } from '../lib/file-accept';
import { friendlyError } from '../lib/error-messages';
import { hasAnySongTitle } from '../lib/song-title';
import { clearUploadDraft, getUploadDraft } from '../lib/upload-draft';
import type { PendingUploadEntry } from '../lib/pending-upload';
import type { UploadMetadata } from '../hooks/useMergeWorkspace';
import type { useLibraryUpload } from '../hooks/useLibraryUpload';
import { useLocalPptxPreview } from '../hooks/useLocalPptxPreview';
import { useI18n } from '../i18n';

type UploadConfirmPageProps = {
  libraryUpload: ReturnType<typeof useLibraryUpload>;
};

export default function UploadConfirmPage({ libraryUpload }: UploadConfirmPageProps) {
  const { t } = useI18n();
  const { uploadFiles } = libraryUpload;
  const [entries, setEntries] = useState<PendingUploadEntry[]>(() => getUploadDraft() ?? []);
  const [activeId, setActiveId] = useState(() => entries[0]?.id ?? '');
  const [focusIndex, setFocusIndex] = useState(0);

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.id === activeId) ?? entries[0] ?? null,
    [entries, activeId],
  );

  const { slides, loading: previewLoading, error: previewError } = useLocalPptxPreview(
    activeEntry?.file ?? null,
    activeEntry?.id ?? '',
  );

  const invalidEntries = entries.filter((entry) => !hasAnySongTitle(entry.metadata));
  const allReady = entries.length > 0 && invalidEntries.length === 0;
  const multiple = entries.length > 1;

  useEffect(() => {
    if (!entries.length) {
      clearUploadDraft();
      window.location.hash = '#/library';
      return;
    }
    document.title = multiple
      ? t('library.uploadConfirmPageTitleBatch', { count: entries.length })
      : t('library.uploadConfirmPageTitle');
  }, [entries.length, multiple, t]);

  useEffect(() => {
    setFocusIndex(0);
  }, [activeEntry?.id]);

  useEffect(() => {
    if (focusIndex >= slides.length) {
      setFocusIndex(Math.max(0, slides.length - 1));
    }
  }, [focusIndex, slides.length]);

  const updateMetadata = useCallback(
    (entryId: string, field: keyof UploadMetadata, value: string) => {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? { ...entry, metadata: { ...entry.metadata, [field]: value } }
            : entry,
        ),
      );
    },
    [],
  );

  const goBack = useCallback(() => {
    clearUploadDraft();
    window.location.hash = '#/library';
  }, []);

  const confirmUpload = useCallback(() => {
    if (!allReady) return;
    const uploads = entries.map((entry) => ({
      file: entry.file,
      metadata: entry.metadata,
    }));
    clearUploadDraft();
    window.location.hash = '#/library';
    void uploadFiles(uploads);
  }, [allReady, entries, uploadFiles]);

  if (!entries.length) {
    return null;
  }

  const focusSlide = slides[focusIndex];

  return (
    <div className="upload-confirm-page">
      <header className="upload-confirm-header">
        <div className="upload-confirm-header-main">
          <h1>
            {multiple
              ? t('library.uploadConfirmTitleBatch', { count: entries.length })
              : t('library.uploadConfirmTitle')}
          </h1>
          <p className="upload-confirm-header-sub">
            {multiple ? t('library.uploadConfirmIntroBatch') : t('library.uploadConfirmIntro')}
          </p>
        </div>
        <div className="upload-confirm-header-actions">
          <button type="button" className="btn-secondary btn-sm" onClick={goBack}>
            {t('library.uploadConfirmBack')}
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={!allReady}
            onClick={confirmUpload}
          >
            {multiple
              ? t('library.uploadConfirmSubmitBatch', { count: entries.length })
              : t('library.uploadConfirmSubmit')}
          </button>
        </div>
      </header>

      <div className="upload-confirm-workspace">
        <section className="upload-confirm-meta-pane">
          {multiple && (
            <div className="upload-confirm-file-tabs" role="tablist">
              {entries.map((entry, index) => {
                const ready = hasAnySongTitle(entry.metadata);
                const active = entry.id === activeEntry?.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`upload-confirm-file-tab${active ? ' active' : ''}${ready ? '' : ' incomplete'}`}
                    onClick={() => setActiveId(entry.id)}
                  >
                    <span className="upload-confirm-file-tab-num">{index + 1}</span>
                    <span className="upload-confirm-file-tab-name">{entry.file.name}</span>
                    <span className="upload-confirm-file-tab-size">{formatSize(entry.file.size)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!multiple && activeEntry && (
            <div className="upload-confirm-single-file">
              <span className="upload-confirm-filename">{activeEntry.file.name}</span>
              <span className="upload-confirm-size">{formatSize(activeEntry.file.size)}</span>
            </div>
          )}

          {activeEntry && (
            <>
              <UploadMetadataForm
                metadata={activeEntry.metadata}
                onChange={(field, value) => updateMetadata(activeEntry.id, field, value)}
              />
              {!hasAnySongTitle(activeEntry.metadata) && (
                <p className="upload-confirm-hint">{t('library.uploadConfirmTitleRequired')}</p>
              )}
            </>
          )}

          {multiple && !allReady && (
            <p className="upload-confirm-hint">
              {t('library.uploadConfirmBatchTitleRequired', { count: invalidEntries.length })}
            </p>
          )}
        </section>

        <section className="upload-confirm-preview-pane" aria-label={t('library.uploadConfirmPreview')}>
          {!activeEntry && (
            <div className="preview-empty">
              <p>{t('library.uploadConfirmSelectFile')}</p>
            </div>
          )}

          {activeEntry && previewLoading && (
            <div className="preview-empty">
              <div className="preview-spinner" />
              <p>{t('preview.converting')}</p>
            </div>
          )}

          {activeEntry && !previewLoading && previewError && (
            <div className="preview-empty">
              <p>{friendlyError(previewError, t)}</p>
            </div>
          )}

          {activeEntry && !previewLoading && !previewError && slides.length === 0 && (
            <div className="preview-empty">
              <p>{t('preview.emptyFile')}</p>
            </div>
          )}

          {activeEntry && !previewLoading && !previewError && slides.length > 0 && focusSlide && (
            <div className="upload-confirm-preview-layout">
              <PptSlidesPane
                slides={slides}
                focusIndex={focusIndex}
                batchMode={false}
                selectedIds={new Set()}
                dragIndex={null}
                dragOverIndex={null}
                onSelect={setFocusIndex}
                onToggleSelect={() => {}}
                onDragStart={() => {}}
                onDragOver={() => {}}
                onDrop={() => {}}
                onDragEnd={() => {}}
              />
              <div className="upload-confirm-canvas">
                <PptCanvasSlide slide={focusSlide} />
              </div>
              <footer className="upload-confirm-preview-status">
                {t('preview.slideCounter', { current: focusIndex + 1, total: slides.length })}
              </footer>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
