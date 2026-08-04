import { useEffect, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { friendlyError } from '../../lib/error-messages';
import {
  formatClipSummary,
  htmlTimeToSeconds,
  resolvePlayClips,
  secondsToHtmlTime,
  type PlayClip,
} from '../../lib/worship-presentation-mode';
import { useI18n } from '../../i18n';

type DraftClip = {
  startSec: number;
  endSec: number | null;
  label: string;
};

function clipsToDraft(clips: PlayClip[]): DraftClip[] {
  if (clips.length === 0) return [{ startSec: 0, endSec: null, label: '' }];
  return clips.map((c) => ({
    startSec: c.startSec,
    endSec: c.endSec,
    label: c.label ?? '',
  }));
}

function rangeInvalid(row: DraftClip): boolean {
  return row.endSec != null && row.endSec <= row.startSec;
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
  const savedClips = resolvePlayClips(item);
  const [open, setOpen] = useState(() => savedClips.length > 0);
  const [rows, setRows] = useState<DraftClip[]>(() => clipsToDraft(savedClips));
  const [clipError, setClipError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const clips = resolvePlayClips(item);
    setRows(clipsToDraft(clips));
    setClipError(null);
    if (clips.length > 0) setOpen(true);
  }, [item.id, item.playClips, item.playStartSec, item.playEndSec]);

  const commit = async (nextRows: DraftClip[]) => {
    if (nextRows.some(rangeInvalid)) {
      setClipError(t('bulletin.worshipClipRangeInvalid'));
      return;
    }

    const parsed: PlayClip[] = [];
    for (const row of nextRows) {
      const blank = row.startSec === 0 && row.endSec == null && !row.label.trim();
      if (blank && nextRows.length === 1) continue;
      if (blank) continue;
      parsed.push({
        startSec: row.startSec,
        endSec: row.endSec,
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
    setClipError(null);
  };

  const onStartChange = (index: number, value: string) => {
    const parsed = htmlTimeToSeconds(value);
    if (parsed === 'invalid') return;
    updateRow(index, { startSec: parsed ?? 0 });
  };

  const onEndChange = (index: number, value: string) => {
    const parsed = htmlTimeToSeconds(value);
    if (parsed === 'invalid') return;
    updateRow(index, { endSec: parsed });
  };

  const clearClips = async () => {
    setRows([{ startSec: 0, endSec: null, label: '' }]);
    setOpen(false);
    setClipError(null);
    if (savedClips.length === 0) return;
    setSaving(true);
    try {
      await onSave({ playClips: null });
    } catch (err) {
      setClipError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
      setOpen(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bulletin-worship-clip-editor">
      <div className="bulletin-worship-clip-toggle-row">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={disabled || saving}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t('bulletin.worshipClipHide') : t('bulletin.worshipClipShow')}
        </button>
        {!open && savedClips.length > 0 ? (
          <span className="bulletin-worship-clip-summary">
            {savedClips.map((c) => formatClipSummary(c)).join(' · ')}
          </span>
        ) : null}
        {open && savedClips.length > 0 ? (
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={disabled || saving}
            onClick={() => void clearClips()}
          >
            {t('bulletin.worshipClipClear')}
          </button>
        ) : null}
      </div>

      {open ? (
        <>
          <div className="bulletin-worship-clip-editor-head">
            <span className="bulletin-worship-clip-editor-label">{t('bulletin.worshipClipSegments')}</span>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={disabled || saving || rows.length >= 40}
              onClick={() => setRows((prev) => [...prev, { startSec: 0, endSec: null, label: '' }])}
            >
              {t('bulletin.worshipClipAddSegment')}
            </button>
          </div>
          <ul className="bulletin-worship-clip-rows">
            {rows.map((row, index) => {
              const badRange = rangeInvalid(row);
              return (
                <li key={index} className="bulletin-worship-clip-row">
                  <label className="bulletin-worship-clip-field bulletin-worship-clip-field--label">
                    <span>{t('bulletin.worshipClipLabel')}</span>
                    <input
                      type="text"
                      className="bulletin-worship-clip-label-input"
                      value={row.label}
                      disabled={disabled || saving}
                      onChange={(e) => updateRow(index, { label: e.target.value })}
                      onBlur={blurCommit}
                    />
                  </label>
                  <label className="bulletin-worship-clip-field">
                    <span>{t('bulletin.worshipClipStart')}</span>
                    <input
                      type="time"
                      step={1}
                      className={
                        badRange
                          ? 'bulletin-worship-clip-input is-invalid'
                          : 'bulletin-worship-clip-input'
                      }
                      value={secondsToHtmlTime(row.startSec)}
                      disabled={disabled || saving}
                      onChange={(e) => onStartChange(index, e.target.value)}
                      onBlur={blurCommit}
                    />
                  </label>
                  <label className="bulletin-worship-clip-field">
                    <span>{t('bulletin.worshipClipEnd')}</span>
                    <input
                      type="time"
                      step={1}
                      className={
                        badRange
                          ? 'bulletin-worship-clip-input is-invalid'
                          : 'bulletin-worship-clip-input'
                      }
                      value={secondsToHtmlTime(row.endSec)}
                      disabled={disabled || saving}
                      onChange={(e) => onEndChange(index, e.target.value)}
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
                        const fallback = next.length
                          ? next
                          : [{ startSec: 0, endSec: null, label: '' }];
                        setRows(fallback);
                        void commit(fallback);
                      }}
                    >
                      {t('bulletin.worshipClipRemoveSegment')}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {clipError ? <span className="bulletin-worship-clip-error">{clipError}</span> : null}
        </>
      ) : null}
    </div>
  );
}
