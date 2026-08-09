import { useEffect, useState } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { parseYoutubeVideoId } from '../../lib/youtube-video-id';

type BulletinDoxologyStepProps = {
  draft: WeeklyBulletin;
  canEdit: boolean;
  onPatch: <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => void;
};

export default function BulletinDoxologyStep({ draft, canEdit, onPatch }: BulletinDoxologyStepProps) {
  const { t } = useI18n();
  const [input, setInput] = useState(draft.doxologyYoutubeVideoId ?? '');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setInput(draft.doxologyYoutubeVideoId ?? '');
    setInvalid(false);
  }, [draft.doxologyYoutubeVideoId]);

  const commit = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setInvalid(false);
      setInput('');
      if (draft.doxologyYoutubeVideoId) onPatch('doxologyYoutubeVideoId', '');
      return;
    }
    const id = parseYoutubeVideoId(trimmed);
    if (!id) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setInput(id);
    if (id !== draft.doxologyYoutubeVideoId) onPatch('doxologyYoutubeVideoId', id);
  };

  return (
    <div className="bulletin-doxology-panel">
      <p className="bulletin-step-hint">{t('bulletin.doxologyYoutubeHint')}</p>
      <label className="share-playlist-field">
        <span className="bulletin-field-label">{t('bulletin.doxologyYoutubeLabel')}</span>
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          disabled={!canEdit}
          value={input}
          placeholder={t('bulletin.doxologyYoutubePlaceholder')}
          onChange={(e) => {
            setInput(e.target.value);
            if (invalid) setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </label>
      {invalid ? <p className="form-error">{t('bulletin.doxologyYoutubeInvalid')}</p> : null}
      {draft.doxologyYoutubeVideoId ? (
        <p className="playlists-muted">
          {t('bulletin.doxologyYoutubeReady', { id: draft.doxologyYoutubeVideoId })}
        </p>
      ) : (
        <p className="playlists-muted">{t('bulletin.doxologyYoutubeEmpty')}</p>
      )}
    </div>
  );
}
