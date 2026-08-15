import { useEffect, useState } from 'react';
import {
  listAdminDownloadJobs,
  retryAdminDownloadJob,
  startAdminAudioJob,
  startAdminVideoJob,
  type AdminDownloadJob,
  type AdminMediaFolderId,
} from '../api/admin-downloads';
import { friendlyError } from '../lib/error-messages';
import { normalizeYoutubeVideoId } from '../lib/youtube-video-id';
import { useI18n } from '../i18n';

const MEDIA_FOLDERS: { id: AdminMediaFolderId; labelKey: string }[] = [
  { id: 'movies', labelKey: 'admin.downloadFolderMovies' },
  { id: 'tv', labelKey: 'admin.downloadFolderTv' },
  { id: 'shortdrama', labelKey: 'admin.downloadFolderShortdrama' },
  { id: 'videos', labelKey: 'admin.downloadFolderVideos' },
  { id: 'anime', labelKey: 'admin.downloadFolderAnime' },
  { id: 'variety', labelKey: 'admin.downloadFolderVariety' },
];

function jobStatusText(
  job: AdminDownloadJob,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (job.status === 'queued') {
    return t('admin.downloadQueued', { position: job.queuePosition || 1 });
  }
  if (job.status === 'done' && job.nasPath) {
    return t('admin.downloadSavedToNas', { path: job.nasPath });
  }
  if (job.status === 'failed') {
    return t(`errors.${job.error || 'download_failed'}`);
  }
  if (job.stage === 'merging') return t('admin.downloadMerging');
  if (job.stage === 'saving') return t('admin.downloadSaving');
  if (job.stage === 'extracting') return t('admin.downloadExtracting');
  return t('admin.downloadProgress', { percent: Math.round(job.percent) });
}

export default function AdminDownloadSection() {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [folder, setFolder] = useState<AdminMediaFolderId>('shortdrama');
  const [series, setSeries] = useState('');
  const [jobs, setJobs] = useState<AdminDownloadJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<'mp3' | 'mp4' | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [jobTab, setJobTab] = useState<'active' | 'done'>('active');

  const activeJobs = jobs.filter((job) => job.status !== 'done');
  const doneJobs = jobs.filter((job) => job.status === 'done');
  const visibleJobs = jobTab === 'active' ? activeJobs : doneJobs;
  const activeCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await listAdminDownloadJobs();
        if (!cancelled) setJobs(next);
      } catch {
        // keep last snapshot
      }
    };
    void refresh();
    if (activeCount === 0) return () => {
      cancelled = true;
    };
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeCount]);

  const enqueue = async (kind: 'mp3' | 'mp4') => {
    const videoId = normalizeYoutubeVideoId(input);
    if (!videoId) {
      setError(t('errors.invalid_youtube_url'));
      return;
    }
    setStarting(kind);
    setError(null);
    try {
      const job =
        kind === 'mp3'
          ? await startAdminAudioJob(videoId, videoId)
          : await startAdminVideoJob(videoId, videoId, folder, series);
      setJobs((prev) => [job, ...prev.filter((row) => row.jobId !== job.jobId)]);
      setJobTab('active');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'download_failed', t));
    } finally {
      setStarting(null);
    }
  };

  const retryJob = async (job: AdminDownloadJob) => {
    setRetryingId(job.jobId);
    setError(null);
    try {
      const next = await retryAdminDownloadJob(job.jobId);
      setJobs((prev) => [next, ...prev.filter((row) => row.jobId !== next.jobId)]);
      setJobTab('active');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'download_failed', t));
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <section className="admin-download-section">
      <h2 className="admin-download-title">{t('admin.downloadTitle')}</h2>
      <p className="admin-muted">{t('admin.downloadIntro')}</p>
      <label className="admin-download-field">
        <span>{t('admin.downloadUrlLabel')}</span>
        <input
          type="text"
          value={input}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('admin.downloadUrlPlaceholder')}
          disabled={starting !== null}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>
      <label className="admin-download-field">
        <span>{t('admin.downloadSeriesLabel')}</span>
        <input
          type="text"
          value={series}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('admin.downloadSeriesPlaceholder')}
          disabled={starting !== null}
          onChange={(e) => setSeries(e.target.value)}
        />
      </label>
      <fieldset className="admin-download-folders" disabled={starting !== null}>
        <legend>{t('admin.downloadFolderLabel')}</legend>
        <div className="admin-download-folder-list">
          {MEDIA_FOLDERS.map((item) => (
            <label key={item.id} className="admin-download-folder-option">
              <input
                type="radio"
                name="admin-download-folder"
                value={item.id}
                checked={folder === item.id}
                onChange={() => setFolder(item.id)}
              />
              <span>{t(item.labelKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="admin-download-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={starting !== null}
          onClick={() => void enqueue('mp3')}
        >
          {t('admin.downloadMp3')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={starting !== null}
          onClick={() => void enqueue('mp4')}
        >
          {t('admin.downloadMp4')}
        </button>
      </div>
      <p className="admin-download-hint">{t('admin.downloadParallelHint')}</p>
      {error && <p className="error-msg">{error}</p>}
      <div className="admin-download-jobs-panel">
        <div className="admin-download-job-tabs page-tabs" role="tablist" aria-label={t('admin.downloadTitle')}>
          <button
            type="button"
            role="tab"
            aria-selected={jobTab === 'active'}
            className={`page-tab${jobTab === 'active' ? ' active' : ''}`}
            onClick={() => setJobTab('active')}
          >
            {t('admin.downloadJobsActive', { count: activeJobs.length })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={jobTab === 'done'}
            className={`page-tab${jobTab === 'done' ? ' active' : ''}`}
            onClick={() => setJobTab('done')}
          >
            {t('admin.downloadJobsDone', { count: doneJobs.length })}
          </button>
        </div>
        <ul className="admin-download-jobs">
          {visibleJobs.length === 0 ? (
            <li className="admin-download-jobs-empty">
              {jobTab === 'active' ? t('admin.downloadJobsEmptyActive') : t('admin.downloadJobsEmptyDone')}
            </li>
          ) : (
            visibleJobs.map((job) => (
              <li key={job.jobId} className={`admin-download-job is-${job.status}`}>
                <div className="admin-download-job-head">
                  <strong>
                    {job.kind === 'mp3' ? t('admin.downloadMp3') : t('admin.downloadMp4')}
                    {job.folderLabel ? ` · ${job.folderLabel}` : ''}
                  </strong>
                  <span>{job.videoId}</span>
                </div>
                <div className="admin-download-progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.percent)}>
                  <div
                    className="admin-download-progress-bar"
                    style={{ width: `${job.status === 'queued' ? 0 : Math.max(2, job.percent)}%` }}
                  />
                </div>
                <div className="admin-download-job-foot">
                  <p className="admin-download-job-status">
                    {job.status === 'failed'
                      ? friendlyError(job.error || 'download_failed', t)
                      : jobStatusText(job, t)}
                  </p>
                  {job.status === 'failed' && (
                    <button
                      type="button"
                      className="btn-sm admin-download-retry"
                      disabled={retryingId === job.jobId}
                      onClick={() => void retryJob(job)}
                    >
                      {retryingId === job.jobId ? t('admin.downloadRetrying') : t('admin.downloadRetry')}
                    </button>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
