import { useEffect, useMemo, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { friendlyError } from '../../lib/error-messages';
import {
  formatClipSummary,
  formatClipTime,
  isClipTimeInputValid,
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

function validateRows(rows: DraftClip[]): string | null {
  for (const row of rows) {
    const blank = !row.startText.trim() && !row.endText.trim() && !row.label.trim();
    if (blank) continue;
    if (!isClipTimeInputValid(row.startText) || !isClipTimeInputValid(row.endText)) {
      return 'invalid';
    }
    const start = parseClipTimeInput(row.startText.trim() ? row.startText : '0');
    const end = parseClipTimeInput(row.endText);
    if (start === 'invalid' || end === 'invalid') return 'invalid';
    if (start != null && end != null && end <= start) return 'range';
  }
  return null;
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

  const rowValidity = useMemo(
    () =>
      rows.map((row) => ({
        startOk: isClipTimeInputValid(row.startText),
        endOk: isClipTimeInputValid(row.endText),
        rangeOk: (() => {
          const start = parseClipTimeInput(row.startText.trim() ? row.startText : '0');
          const end = parseClipTimeInput(row.endText);
          if (start === 'invalid' || end === 'invalid') return true;
          if (start == null || end == null) return true;
          return end > start;
        })(),
      })),
    [rows],
  );

  const commit = async (nextRows: DraftClip[]) => {
    const issue = validateRows(nextRows);
    if (issue === 'invalid') {
      setClipError(t('bulletin.worshipClipInvalid'));
      return;
    }
    if (issue === 'range') {
      setClipError(t('bulletin.worshipClipRangeInvalid'));
      return;
    }

    const parsed: PlayClip[] = [];
    const normalized = nextRows.map((row) => ({ ...row }));
    for (let i = 0; i < nextRows.length; i++) {
      const row = nextRows[i]!;
      const blank = !row.startText.trim() && !row.endText.trim() && !row.label.trim();
      if (blank) continue;
      const start = parseClipTimeInput(row.startText.trim() ? row.startText : '0');
      const end = parseClipTimeInput(row.endText);
      if (start === 'invalid' || end === 'invalid') return;
      const startSec = start ?? 0;
      normalized[i] = {
        ...row,
        startText: formatClipTime(startSec),
        endText: end == null ? '' : formatClipTime(end),
      };
      parsed.push({
        startSec,
        endSec: end,
        label: row.label.trim() || null,
      });
    }
    setRows(normalized);

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
    setClipError(null);
  };

  return (
    <div className="bulletin-worship-clip-editor">
      <div className="bulletin-worship-clip-editor-head">
        <div className="bulletin-worship-clip-editor-title-block">
          <span className="bulletin-worship-clip-editor-label">{t('bulletin.worshipClipSegments')}</span>
          <span className="bulletin-worship-clip-format-hint">{t('bulletin.worshipClipFormatHint')}</span>
        </div>
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
        {rows.map((row, index) => {
          const validity = rowValidity[index]!;
          return (
            <li key={index} className="bulletin-worship-clip-row">
              <label className="bulletin-worship-clip-field bulletin-worship-clip-field--label">
                <span>{t('bulletin.worshipClipLabel')}</span>
                <input
                  type="text"
                  className="bulletin-worship-clip-label-input"
                  placeholder={t('bulletin.worshipClipLabelPlaceholder')}
                  value={row.label}
                  disabled={disabled || saving}
                  onChange={(e) => updateRow(index, { label: e.target.value })}
                  onBlur={blurCommit}
                />
              </label>
              <label className="bulletin-worship-clip-field">
                <span>{t('bulletin.worshipClipStart')}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('bulletin.worshipClipStartPlaceholder')}
                  aria-invalid={!validity.startOk || !validity.rangeOk}
                  className={
                    !validity.startOk || !validity.rangeOk
                      ? 'bulletin-worship-clip-input is-invalid'
                      : 'bulletin-worship-clip-input'
                  }
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
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('bulletin.worshipClipEndPlaceholder')}
                  aria-invalid={!validity.endOk || !validity.rangeOk}
                  className={
                    !validity.endOk || !validity.rangeOk
                      ? 'bulletin-worship-clip-input is-invalid'
                      : 'bulletin-worship-clip-input'
                  }
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
          );
        })}
      </ul>
      {resolvePlayClips(item).length > 0 ? (
        <p className="bulletin-worship-clip-summary-line">
          {resolvePlayClips(item).map((c) => formatClipSummary(c)).join(' · ')}
        </p>
      ) : null}
      {clipError ? <span className="bulletin-worship-clip-error">{clipError}</span> : null}
    </div>
  );
}
