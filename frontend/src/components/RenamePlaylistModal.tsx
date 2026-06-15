import { useEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type RenamePlaylistModalProps = {
  initialTitle: string;
  modalTitle?: string;
  onClose: () => void;
  onRename: (title: string) => Promise<void>;
  busy?: boolean;
};

export default function RenamePlaylistModal({
  initialTitle,
  modalTitle,
  onClose,
  onRename,
  busy = false,
}: RenamePlaylistModalProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(initialTitle);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, submitting, onClose]);

  const disabled = busy || submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || disabled) return;

    setSubmitting(true);
    setError(null);
    try {
      await onRename(trimmed);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'update_playlist_failed', t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="metadata-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-playlist-modal-title"
      onClick={disabled ? undefined : onClose}
    >
      <div className="metadata-modal create-playlist-modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="metadata-modal-header">
            <h3 id="rename-playlist-modal-title">{modalTitle ?? t('playlists.rename')}</h3>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label={t('metadata.close')}
              disabled={disabled}
            >
              ×
            </button>
          </div>

          <div className="metadata-modal-body create-playlist-modal-body">
            <label className="create-playlist-modal-label" htmlFor="rename-playlist-modal-input">
              {t('playlists.renameLabel')}
            </label>
            <input
              ref={inputRef}
              id="rename-playlist-modal-input"
              type="text"
              className="playlists-text-input create-playlist-modal-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('playlists.createPlaceholder')}
              disabled={disabled}
              maxLength={200}
              autoComplete="off"
            />
            {error && <p className="error-msg">{error}</p>}
          </div>

          <div className="metadata-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={disabled}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={disabled || !title.trim()}>
              {submitting || busy ? t('playlists.renaming') : t('playlists.renameSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
