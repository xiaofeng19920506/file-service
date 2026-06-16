import { useEffect, useState } from 'react';
import {
  addBulletinWorshipPlaylistItems,
  openBulletinWorshipPlaylist,
} from '../../api/bulletins';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';
import type { PlaylistDetail } from '../../api/playlists';

const DEFAULT_ROW_COUNT = 4;

type ManualLinksPlaylistModalProps = {
  bulletinId: string;
  onClose: () => void;
  onImported: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
};

function emptyRows(count: number): string[] {
  return Array.from({ length: count }, () => '');
}

export default function ManualLinksPlaylistModal({
  bulletinId,
  onClose,
  onImported,
}: ManualLinksPlaylistModalProps) {
  const { t } = useI18n();
  const [urls, setUrls] = useState<string[]>(() => emptyRows(DEFAULT_ROW_COUNT));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  const updateUrl = (index: number, value: string) => {
    setUrls((prev) => prev.map((row, i) => (i === index ? value : row)));
  };

  const addRow = () => {
    setUrls((prev) => [...prev, '']);
  };

  const handleComplete = async () => {
    const trimmed = urls.map((row) => row.trim()).filter(Boolean);
    if (!trimmed.length || submitting) return;

    setSubmitting(true);
    setError(null);
    setProgress(null);

    try {
      await openBulletinWorshipPlaylist(bulletinId);
      let lastDetail: PlaylistDetail | null = null;
      let addedTotal = 0;
      let skippedTotal = 0;

      for (let i = 0; i < trimmed.length; i += 1) {
        setProgress(t('bulletin.worshipManualLinksProgress', { current: i + 1, total: trimmed.length }));
        const data = await addBulletinWorshipPlaylistItems(bulletinId, trimmed[i]!);
        lastDetail = data;
        addedTotal += data.addedCount;
        skippedTotal += data.skippedCount;
      }

      if (lastDetail) {
        onImported(lastDetail, { addedCount: addedTotal, skippedCount: skippedTotal });
      }
      onClose();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'add_playlist_item_failed', t));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <div className="metadata-modal-overlay" role="dialog" aria-modal="true">
      <div className="metadata-modal bulletin-worship-manual-modal">
        <header className="metadata-modal-header">
          <h3>{t('bulletin.worshipManualLinksTitle')}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </header>

        <div className="metadata-modal-body">
          <ol className="bulletin-worship-manual-url-list">
            {urls.map((url, index) => (
              <li key={index}>
                <label className="bulletin-worship-manual-url-field">
                  <span>{t('bulletin.worshipManualLinksSong', { index: index + 1 })}</span>
                  <input
                    type="url"
                    className="playlists-text-input"
                    value={url}
                    onChange={(e) => updateUrl(index, e.target.value)}
                    placeholder={t('playlists.addPlaceholder')}
                    disabled={submitting}
                  />
                </label>
              </li>
            ))}
          </ol>

          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={addRow}
            disabled={submitting}
          >
            {t('bulletin.worshipManualLinksAddRow')}
          </button>

          {progress && <p className="playlists-muted">{progress}</p>}
          {error && <p className="error-msg">{error}</p>}
        </div>

        <footer className="metadata-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleComplete()}
            disabled={submitting || !urls.some((row) => row.trim())}
          >
            {submitting ? t('bulletin.worshipManualLinksSubmitting') : t('bulletin.worshipManualLinksComplete')}
          </button>
        </footer>
      </div>
    </div>
  );
}
