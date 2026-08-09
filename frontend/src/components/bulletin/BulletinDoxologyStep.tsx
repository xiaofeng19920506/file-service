import { useEffect, useState } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import {
  DEFAULT_DOXOLOGY_YOUTUBE_URL,
  resolveDoxologyYoutubeVideoId,
} from '../../lib/bulletin-doxology';
import { parseYoutubeVideoId } from '../../lib/youtube-video-id';

type BulletinDoxologyStepProps = {
  draft: WeeklyBulletin;
  canEdit: boolean;
  onPatch: <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => void;
};

export default function BulletinDoxologyStep({ draft, canEdit, onPatch }: BulletinDoxologyStepProps) {
  const { t } = useI18n();
  const resolvedId = resolveDoxologyYoutubeVideoId(draft.doxologyYoutubeVideoId);
  const [input, setInput] = useState(
    draft.doxologyYoutubeVideoId?.trim()
      ? draft.doxologyYoutubeVideoId
      : DEFAULT_DOXOLOGY_YOUTUBE_URL,
  );
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setInput(
      draft.doxologyYoutubeVideoId?.trim()
        ? draft.doxologyYoutubeVideoId
        : DEFAULT_DOXOLOGY_YOUTUBE_URL,
    );
    setInvalid(false);
  }, [draft.doxologyYoutubeVideoId]);

  const commit = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      // 清空则回落到本堂默认三一颂
      setInvalid(false);
      setInput(DEFAULT_DOXOLOGY_YOUTUBE_URL);
      onPatch('doxologyYoutubeVideoId', resolveDoxologyYoutubeVideoId(''));
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
      <h3 className="bulletin-step-title">{t('bulletin.sections.doxology')}</h3>
      <p className="bulletin-step-hint">{t('bulletin.doxologyYoutubeHint')}</p>
      <label className="share-playlist-field">
        <span>{t('bulletin.doxologyYoutubeLabel')}</span>
        <input
          type="url"
          className="playlists-text-input"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          disabled={!canEdit}
          value={input}
          placeholder={DEFAULT_DOXOLOGY_YOUTUBE_URL}
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
      <p className="playlists-muted">
        {t('bulletin.doxologyYoutubeReady', { id: resolvedId })}
      </p>
    </div>
  );
}
