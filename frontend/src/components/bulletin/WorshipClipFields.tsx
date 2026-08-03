import { useEffect, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { friendlyError } from '../../lib/error-messages';
import {
  formatClipSummary,
  formatClipTime,
  parseClipTimeInput,
  resolvePlayClips,
  type PlayClip,
} from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';

type DraftClip = {
  startText: string;
  endText: string;
  label: string;
};

function clipsToDraft(clips: PlayClip[]): DraftClip[] {
  if (clips.length === 0) return [{ startText: '', endText: '', label: '' }];
  return clips.map((c) => ({
    startText: formatClipTime(c.startSec),
    endText: formatClipTime(c.endSec),
    label: c.label ?? '',
  }));
}

type WorshipClipFieldsProps = {
  item: PlaylistItem;
  disabled?: boolean;
  onSave: (patch: { playClips: PlayClip[] | null }) => Promise<void>;
};

export default function WorshipClipFields({
  item,
  disabled = false,
  onSave,
}: WorshipClipFieldsProps) {
  const { t } = useI18n();
  const [rows, setRows] = useState<DraftClip[]>(() => clipsToDraft(resolvePlayClips(item)));
  const [clipError, setClipError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(clipsToDraft(resolvePlayClips(item)));
    setClipError(null);
  }, [item.id, item.playClips, item.playStartSec, item.playEndSec]);

  const commit = async (nextRows: DraftClip[]) => {
    const parsed: PlayClip[] = [];
    for (const row of nextRows) {
      const startEmpty = !row.startText.trim() && !row.endText.trim() && !row.label.trim();
      if (startEmpty) continue;
      const start = parseClipTimeInput(row.startText.trim() ? row.startText : '0');
      const end = parseClipTimeInput(row.endText);
      if (start === 'invalid' || end === 'invalid') {
        setClipError(t('bulletin.worshipClipInvalid'));
        return;
      }
      if (start != null && end != null && end <= start) {
        setClipError(t('bulletin.worshipClipRangeInvalid'));
        return;
      }
      parsed.push({
        startSec: start ?? 0,
        endSec: end,
        label: row.label.trim() || null,
      });
    }

    const prev = resolvePlayClips(item);
    const same =
      prev.length === parsed.length &&
      prev.every(
        (c, i) =>
          c.startSec === parsed[i]!.startSec &&
          c.endSec === parsed[i]!.endSec &&
          (c.label ?? null) === (parsed[i]!.label ?? null),
      );
    if (same) {
      setClipError(null);
      return;
    }

    setSaving(true);
    setClipError(null);
    try {
      await onSave({ playClips: parsed.length > 0 ? parsed : null });
    } catch (err) {
      setClipError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
    } finally {
      setSaving(false);
    }
  };

  const blurCommit = () => {
    setRows((current) => {
      void commit(current);
      return current;
    });
  };

  const updateRow = (index: number, patch: Partial<DraftClip>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="bulletin-worship-clip-editor">
      <div className="bulletin-worship-clip-editor-head">
        <span className="bulletin-worship-clip-editor-label">{t('bulletin.worshipClipSegments')}</span>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={disabled || saving || rows.length >= 40}
          onClick={() => setRows((prev) => [...prev, { startText: '', endText: '', label: '' }])}
        >
          {t('bulletin.worshipClipAddSegment')}
        </button>
      </div>
      <ul className="bulletin-worship-clip-rows">
        {rows.map((row, index) => (
          <li key={index} className="bulletin-worship-clip-row">
            <input
              type="text"
              className="bulletin-worship-clip-label-input"
              placeholder={t('bulletin.worshipClipLabelPlaceholder')}
              value={row.label}
              disabled={disabled || saving}
              onChange={(e) => updateRow(index, { label: e.target.value })}
              onBlur={blurCommit}
            />
            <label className="bulletin-worship-clip-field">
              <span>{t('bulletin.worshipClipStart')}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0:00"
                value={row.startText}
                disabled={disabled || saving}
                onChange={(e) => updateRow(index, { startText: e.target.value })}
                onBlur={blurCommit}
              />
            </label>
            <label className="bulletin-worship-clip-field">
              <span>{t('bulletin.worshipClipEnd')}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder={t('bulletin.worshipClipEndPlaceholder')}
                value={row.endText}
                disabled={disabled || saving}
                onChange={(e) => updateRow(index, { endText: e.target.value })}
                onBlur={blurCommit}
              />
            </label>
            {rows.length > 1 ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={disabled || saving}
                onClick={() => {
                  const next = rows.filter((_, i) => i !== index);
                  setRows(next.length ? next : [{ startText: '', endText: '', label: '' }]);
                  void commit(next);
                }}
              >
                {t('bulletin.worshipClipRemoveSegment')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {resolvePlayClips(item).length > 1 ? (
        <p className="bulletin-worship-clip-summary-line">
          {resolvePlayClips(item).map((c) => formatClipSummary(c)).join(' · ')}
        </p>
      ) : null}
      {clipError ? <span className="bulletin-worship-clip-error">{clipError}</span> : null}
    </div>
  );
}
