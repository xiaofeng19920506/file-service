import { useCallback, useEffect, useState } from 'react';
import { getDownloadUrl } from '../api/client';
import PptEditor from '../components/PptEditor/PptEditor';
import { friendlyError } from '../lib/error-messages';
import { mergeBlobIdsAndGetDownloadUrl, triggerFileDownload } from '../lib/merge-job';
import { useI18n } from '../i18n';

type MergeEditPageProps = {
  blobIds: string[];
  title?: string;
};

export default function MergeEditPage({ blobIds, title }: MergeEditPageProps) {
  const { t } = useI18n();
  const pageTitle = title?.trim() || t('merge.editPageDefaultTitle');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${pageTitle} — ${t('merge.editPageTitle')}`;
  }, [pageTitle, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setJobId(null);
    setDownloadUrl(null);

    void (async () => {
      try {
        const result = await mergeBlobIdsAndGetDownloadUrl(blobIds);
        if (cancelled) return;
        setJobId(result.jobId);
        setDownloadUrl(result.url);
      } catch (e) {
        if (cancelled) return;
        setError(friendlyError(e instanceof Error ? e.message : 'merge_failed', t));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blobIds, t]);

  const refreshDownloadUrl = useCallback(() => {
    if (!jobId) return;
    void getDownloadUrl(jobId)
      .then((res) => setDownloadUrl(res.url))
      .catch(() => {});
  }, [jobId]);

  const handleDownload = useCallback(async () => {
    if (!jobId || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const { url } = await getDownloadUrl(jobId);
      setDownloadUrl(url);
      triggerFileDownload(url);
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : 'download_url_failed', t));
    } finally {
      setDownloading(false);
    }
  }, [jobId, downloading, t]);

  return (
    <div className="merge-edit-page">
      {error && (
        <p className="error-msg merge-edit-error">{error}</p>
      )}

      <div className="merge-edit-workspace">
        {loading && (
          <div className="preview-empty">
            <div className="preview-spinner" />
            <p>{t('status.running')}</p>
          </div>
        )}

        {!loading && !error && downloadUrl && jobId && (
          <PptEditor
            title={pageTitle}
            mergedUrl={downloadUrl}
            jobId={jobId}
            onSaved={refreshDownloadUrl}
            onDownload={() => void handleDownload()}
            canDownload={!!downloadUrl && !loading}
            downloading={downloading}
            onClose={() => window.close()}
          />
        )}
      </div>
    </div>
  );
}
