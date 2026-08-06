import { useEffect, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { getYoutubeAudioStatus } from '../../api/youtube-audio';
import { friendlyError } from '../../lib/error-messages';
import {
  clipExceedsDuration,
  formatClipTime,
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

function clipsToDraft(clips: PlayClip[], durationSec?: number | null): DraftClip[] {
  const defaultEnd = durationSec != null && durationSec > 0 ? durationSec : null;
  if (clips.length === 0) return [{ startSec: 0, endSec: defaultEnd, label: '' }];
  return clips.map((c) => ({
    startSec: c.startSec,
    endSec: c.endSec ?? defaultEnd,
    label: c.label ?? '',
  }));
}

function rangeInvalid(row: DraftClip): boolean {
  return row.endSec != null && row.endSec <= row.startSec;
}

/** 终点等于视频总长时视为「播到结尾」 */
function normalizeEndForSave(
  endSec: number | null,
  durationSec: number | null,
): number | null {
  if (endSec == null) return null;
  if (durationSec != null && endSec >= durationSec) return null;
  return endSec;
}

type WorshipClipFieldsProps = {
  item: PlaylistItem;
  disabled?: boolean;
  onSave: (patch: { playClips: PlayClip[] | null }) => Promise<void>;
  /** 受控展开（由 ⋯ 菜单触发时使用） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 隐藏自带切换按钮，改由外部菜单控制 */
  hideToggle?: boolean;
};

export default function WorshipClipFields({
  item,
  disabled = false,
  onSave,
  open: openProp,
  onOpenChange,
  hideToggle = false,
}: WorshipClipFieldsProps) {
  const { t } = useI18n();
  const savedClips = resolvePlayClips(item);
  const [internalOpen, setInternalOpen] = useState(() => savedClips.length > 0);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setInternalOpen(next);
  };

  const [rows, setRows] = useState<DraftClip[]>(() => clipsToDraft(savedClips));
  const [clipError, setClipError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [durationSec, setDurationSec] = useState<number | null>(null);

  useEffect(() => {
    const clips = resolvePlayClips(item);
    setRows(clipsToDraft(clips, durationSec));
    setClipError(null);
    if (clips.length > 0 && openProp === undefined) setInternalOpen(true);
    // durationSec 由下方 effect 单独回填终点，避免编辑中途被重置
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅跟随条目数据
  }, [item.id, item.playClips, item.playStartSec, item.playEndSec, openProp]);

  useEffect(() => {
    if (durationSec == null || durationSec <= 0) return;
    setRows((prev) =>
      prev.map((row) => (row.endSec == null ? { ...row, endSec: durationSec } : row)),
    );
  }, [durationSec]);

  useEffect(() => {
    if (!open || !item.youtubeVideoId) return;
    let cancelled = false;
    void getYoutubeAudioStatus(item.youtubeVideoId)
      .then((status) => {
        if (cancelled) return;
        const seconds = status.durationSeconds;
        setDurationSec(
          typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
            ? Math.floor(seconds)
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setDurationSec(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, item.youtubeVideoId]);

  const exceedsDuration = (row: DraftClip): boolean =>
    durationSec != null && clipExceedsDuration(row, durationSec);

  const commit = async (nextRows: DraftClip[]) => {
    if (nextRows.some(rangeInvalid)) {
      setClipError(t('bulletin.worshipClipRangeInvalid'));
      return;
    }
    if (durationSec != null && nextRows.some((row) => clipExceedsDuration(row, durationSec))) {
      setClipError(
        t('bulletin.worshipClipExceedsDuration', {
          duration: formatClipTime(durationSec) || String(durationSec),
        }),
      );
      return;
    }

    const parsed: PlayClip[] = [];
    for (const row of nextRows) {
      const endSec = normalizeEndForSave(row.endSec, durationSec);
      const blank = row.startSec === 0 && endSec == null && !row.label.trim();
      if (blank && nextRows.length === 1) continue;
      if (blank) continue;
      parsed.push({
        startSec: row.startSec,
        endSec,
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
    // 清空终点 → 默认回到视频结尾
    if (parsed == null) {
      updateRow(index, { endSec: durationSec });
      return;
    }
    updateRow(index, { endSec: parsed });
  };

  const clearClips = async () => {
    setRows([{ startSec: 0, endSec: durationSec, label: '' }]);
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

  const addSegment = () => {
    setRows((prev) => [...prev, { startSec: 0, endSec: durationSec, label: '' }]);
  };

  if (!open && hideToggle) return null;

  const endDisplayValue = (row: DraftClip) => secondsToHtmlTime(row.endSec ?? durationSec);

  return (
    <div className="bulletin-worship-clip-editor">
      {!hideToggle ? (
        <div className="bulletin-worship-clip-toggle-row">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={disabled || saving}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t('bulletin.worshipClipHide') : t('bulletin.worshipClipShow')}
          </button>
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
      ) : null}

      {open ? (
        <>
          <div className="bulletin-worship-clip-editor-head">
            <span className="bulletin-worship-clip-editor-label">{t('bulletin.worshipClipSegments')}</span>
            <div className="bulletin-worship-clip-editor-head-actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={disabled || saving || rows.length >= 40}
                onClick={addSegment}
              >
                {t('bulletin.worshipClipAddSegment')}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={disabled || saving}
                onClick={() => setOpen(false)}
              >
                {t('bulletin.worshipClipHide')}
              </button>
              {savedClips.length > 0 ? (
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
          </div>
          {durationSec != null ? (
            <p className="bulletin-worship-clip-duration-hint">
              {t('bulletin.worshipClipVideoDuration', {
                duration: formatClipTime(durationSec) || String(durationSec),
              })}
            </p>
          ) : null}
          <ul className="bulletin-worship-clip-rows">
            {rows.map((row, index) => {
              const badRange = rangeInvalid(row) || exceedsDuration(row);
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
                      value={endDisplayValue(row)}
                      disabled={disabled || saving}
                      onChange={(e) => onEndChange(index, e.target.value)}
                      onBlur={blurCommit}
                      title={
                        durationSec != null
                          ? t('bulletin.worshipClipEndDefaultHint', {
                              duration: formatClipTime(durationSec) || String(durationSec),
                            })
                          : undefined
                      }
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
                          : [{ startSec: 0, endSec: durationSec, label: '' }];
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
