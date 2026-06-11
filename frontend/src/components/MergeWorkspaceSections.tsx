import { DragHandleIcon } from './icons';
import { formatSize } from '../lib/file-accept';
import { useI18n } from '../i18n';
import type { MergeWorkspace } from '../hooks/useMergeWorkspace';
import { localizedSongTitle, primarySongTitle } from '../lib/song-title';
import type { UploadedItem } from '../types';

type FileListMode = 'library' | 'merge';

function displaySongTitle(item: UploadedItem): string {
  return primarySongTitle(item) || item.file.name;
}

function displayMergeListTitle(
  item: UploadedItem,
  locale: 'zh-CN' | 'en',
): string {
  if (item.blobId) {
    const title = localizedSongTitle(item, locale);
    if (title) return title;
  }
  return item.file.name;
}

type FileListSectionProps = {
  workspace: MergeWorkspace;
  mode: FileListMode;
  listLabel?: React.ReactNode;
  listStep?: string;
};

export function FileListSection({ workspace, mode, listLabel, listStep }: FileListSectionProps) {
  const { t, locale } = useI18n();
  const {
    items,
    listDragIndex,
    setListDragIndex,
    listDragOver,
    setListDragOver,
    downloading,
    failedUploads,
    dropAtTarget,
    retryUpload,
    removeItem,
    retryAllFailed,
  } = workspace;

  if (!items.length) return null;

  const sectionClass =
    mode === 'library'
      ? 'file-section workflow-section workflow-setlist'
      : 'file-section';

  return (
    <section className={sectionClass}>
      <div className="file-section-head">
        {mode === 'library' ? (
          <div className="workflow-section-head workflow-section-head-inline">
            {listStep && <span className="workflow-step">{listStep}</span>}
            <h2 className="workflow-title">{listLabel ?? t('workflow.setlist')}</h2>
          </div>
        ) : (
          <span className="file-section-head-spacer" aria-hidden />
        )}
        <div className="file-section-actions">
          {failedUploads.length > 0 && (
            <button type="button" className="preview-tab retry-all" onClick={() => retryAllFailed()}>
              {t('upload.retryAll', { count: failedUploads.length })}
            </button>
          )}
        </div>
      </div>
      <ul className="file-list">
        {items.map((item, index) => (
          <li
            key={item.id}
            className={`file-item${listDragIndex === index ? ' dragging' : ''}${listDragOver?.index === index && !listDragOver.after ? ' drag-over-before' : ''}${listDragOver?.index === index && listDragOver.after ? ' drag-over-after' : ''}`}
            draggable={!downloading && item.status === 'done'}
            onDragStart={(e) => {
              if (downloading || item.status !== 'done') {
                e.preventDefault();
                return;
              }
              e.dataTransfer.effectAllowed = 'move';
              setListDragIndex(index);
            }}
            onDragOver={(e) => {
              if (listDragIndex === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const rect = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > rect.top + rect.height / 2;
              setListDragOver({ index, after });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (listDragIndex !== null && listDragOver) {
                dropAtTarget(listDragIndex, listDragOver);
              }
              setListDragIndex(null);
              setListDragOver(null);
            }}
            onDragEnd={() => {
              setListDragIndex(null);
              setListDragOver(null);
            }}
          >
            <span
              className={`drag-handle${item.status !== 'done' || downloading ? ' disabled' : ''}`}
              aria-hidden
            >
              <DragHandleIcon />
            </span>
            <div className="file-select">
              <span className="file-index">{index + 1}</span>
              <div className="file-info">
                <span className="file-name">
                  {mode === 'library'
                    ? displaySongTitle(item)
                    : displayMergeListTitle(item, locale)}
                </span>
                {mode === 'library' &&
                  (item.titleZhCn || item.titleZhTw || item.titleEn || item.composer || item.author) && (
                  <span className="file-song-meta">
                    {[
                      item.composer && `${t('search.composer')}：${item.composer}`,
                      item.author && `${t('search.author')}：${item.author}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                {mode === 'library' &&
                  primarySongTitle(item) &&
                  item.file.name !== primarySongTitle(item) && (
                  <span className="file-original-name">{item.file.name}</span>
                )}
                <span
                  className={`file-detail${
                    item.status === 'error'
                      ? ' error'
                      : item.status === 'uploading' || item.status === 'queued'
                        ? ' uploading'
                        : ''
                  }`}
                >
                  {item.status === 'queued' && t('files.queued')}
                  {item.status === 'uploading' &&
                    t('files.uploading', { percent: item.progress ?? 0 })}
                  {item.status === 'error' && item.error}
                  {item.status === 'done' &&
                    (mode === 'merge'
                      ? [
                          item.deduplicated ? t('files.deduplicated') : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : `${formatSize(item.file.size)}${item.deduplicated ? ` · ${t('files.deduplicated')}` : ''}`)}
                </span>
                {(item.status === 'uploading' || item.status === 'queued') && (
                  <div className="file-progress progress-bar" aria-hidden>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${item.status === 'queued' ? 0 : item.progress ?? 0}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="file-controls">
              {item.status === 'error' && (
                <button
                  type="button"
                  className="ctrl-btn retry"
                  disabled={downloading}
                  onClick={() => retryUpload(item.id)}
                  aria-label={t('files.retry')}
                  title={t('files.retry')}
                >
                  ↻
                </button>
              )}
              <button
                type="button"
                className="ctrl-btn remove"
                disabled={downloading}
                onClick={() => removeItem(item.id)}
                aria-label={t('files.remove')}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UploadSummarySection({ workspace }: { workspace: MergeWorkspace }) {
  const { t } = useI18n();
  const { uploadSummary } = workspace;
  if (!uploadSummary) return null;

  return (
    <section className="upload-summary" aria-live="polite">
      <div className="upload-summary-head">
        <span className="upload-summary-text">
          {t('upload.summary', {
            count: uploadSummary.active + uploadSummary.queued,
          })}
          {uploadSummary.queued > 0 && t('upload.summaryQueued', { queued: uploadSummary.queued })}
        </span>
        <span className="upload-summary-percent">{uploadSummary.percent}%</span>
      </div>
      <div className="upload-summary-bar progress-bar">
        <div className="progress-fill" style={{ width: `${uploadSummary.percent}%` }} />
      </div>
    </section>
  );
}
