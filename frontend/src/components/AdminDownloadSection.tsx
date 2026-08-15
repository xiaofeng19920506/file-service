import { useState } from 'react';
import { saveAdminAudioToNas, saveAdminVideoToNas } from '../api/admin-downloads';
import { friendlyError } from '../lib/error-messages';
import { normalizeYoutubeVideoId } from '../lib/youtube-video-id';
import { useI18n } from '../i18n';

type BusyKind = 'mp3' | 'mp4' | null;

export default function AdminDownloadSection() {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<BusyKind>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDownload = async (kind: 'mp3' | 'mp4') => {
    const videoId = normalizeYoutubeVideoId(input);
    if (!videoId) {
      setError(t('errors.invalid_youtube_url'));
      setStatus(null);
      return;
    }

    setBusy(kind);
    setError(null);
    setStatus(kind === 'mp3' ? t('admin.downloadPreparing') : t('admin.downloadPreparingVideo'));
    try {
      const saved =
        kind === 'mp3'
          ? await saveAdminAudioToNas(videoId, videoId)
          : await saveAdminVideoToNas(videoId, videoId);
      setStatus(t('admin.downloadSavedToNas', { path: saved.nasPath }));
    } catch (err) {
      setStatus(null);
      setError(friendlyError(err instanceof Error ? err.message : 'download_failed', t));
    } finally {
      setBusy(null);
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
          disabled={busy !== null}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>
      <div className="admin-download-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy !== null}
          onClick={() => void runDownload('mp3')}
        >
          {busy === 'mp3' ? t('admin.downloadPreparing') : t('admin.downloadMp3')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy !== null}
          onClick={() => void runDownload('mp4')}
        >
          {busy === 'mp4' ? t('admin.downloadPreparingVideo') : t('admin.downloadMp4')}
        </button>
      </div>
      {status && <p className="admin-download-status">{status}</p>}
      {error && <p className="error-msg">{error}</p>}
    </section>
  );
}
