import { useEffect, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { friendlyError } from '../../lib/error-messages';
import { formatClipTime, parseClipTimeInput } from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';

type WorshipClipFieldsProps = {
  item: PlaylistItem;
  disabled?: boolean;
  onSave: (patch: { playStartSec: number | null; playEndSec: number | null }) => Promise<void>;
};

export default function WorshipClipFields({
  item,
  disabled = false,
  onSave,
}: WorshipClipFieldsProps) {
  const { t } = useI18n();
  const [startText, setStartText] = useState(() => formatClipTime(item.playStartSec));
  const [endText, setEndText] = useState(() => formatClipTime(item.playEndSec));
  const [clipError, setClipError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStartText(formatClipTime(item.playStartSec));
    setEndText(formatClipTime(item.playEndSec));
  }, [item.id, item.playStartSec, item.playEndSec]);

  const commit = async () => {
    const start = parseClipTimeInput(startText);
    const end = parseClipTimeInput(endText);
    if (start === 'invalid' || end === 'invalid') {
      setClipError(t('bulletin.worshipClipInvalid'));
      return;
    }
    if (start != null && end != null && end <= start) {
      setClipError(t('bulletin.worshipClipRangeInvalid'));
      return;
    }
    if (start === (item.playStartSec ?? null) && end === (item.playEndSec ?? null)) {
      setClipError(null);
      return;
    }
    setSaving(true);
    setClipError(null);
    try {
      await onSave({ playStartSec: start, playEndSec: end });
    } catch (err) {
      setClipError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bulletin-worship-clip-fields">
      <label className="bulletin-worship-clip-field">
        <span>{t('bulletin.worshipClipStart')}</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="0:00"
          value={startText}
          disabled={disabled || saving}
          onChange={(e) => setStartText(e.target.value)}
          onBlur={() => void commit()}
        />
      </label>
      <label className="bulletin-worship-clip-field">
        <span>{t('bulletin.worshipClipEnd')}</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('bulletin.worshipClipEndPlaceholder')}
          value={endText}
          disabled={disabled || saving}
          onChange={(e) => setEndText(e.target.value)}
          onBlur={() => void commit()}
        />
      </label>
      {clipError ? <span className="bulletin-worship-clip-error">{clipError}</span> : null}
    </div>
  );
}
