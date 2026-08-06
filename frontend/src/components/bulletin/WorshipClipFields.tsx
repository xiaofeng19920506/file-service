import { useEffect, useState } from 'react';
import type { PlaylistItem } from '../../api/playlists';
import { getYoutubeAudioStatus } from '../../api/youtube-audio';
import { friendlyError } from '../../lib/error-messages';
import {
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

/** 终点等于视频总长时视为「播到结尾」 */
function normalizeEndForSave(
  endSec: number | null,
  durationSec: number | null,
): number | null {
  if (endSec == null) return null;
  if (durationSec != null && endSec >= durationSec) return null;
  return endSec;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 按视频时长与起止互斥关系，钳制到合法区间 */
function clampClipRow(
  row: DraftClip,
  durationSec: number | null,
  patch: Partial<DraftClip> = {},
): DraftClip {
  const duration =
    durationSec != null && durationSec > 0 ? Math.floor(durationSec) : null;
  const maxStart = duration != null ? Math.max(0, duration - 1) : Number.MAX_SAFE_INTEGER;

  let startSec = patch.startSec !== undefined ? patch.startSec : row.startSec;
  let endSec = patch.endSec !== undefined ? patch.endSec : row.endSec;
  const label = patch.label !== undefined ? patch.label : row.label;

  startSec = Math.max(0, Math.floor(startSec));
  if (duration != null) {
    startSec = clamp(startSec, 0, maxStart);
  }

  if (endSec != null) {
    endSec = Math.floor(endSec);
    const minEnd = startSec + 1;
    if (duration != null) {
      endSec = clamp(endSec, minEnd, duration);
    } else if (endSec <= startSec) {
      endSec = minEnd;
    }
  } else if (duration != null) {
    endSec = duration;
  }

  // 若终点被压到与起点冲突，再把起点往前挪一点
  if (endSec != null && endSec <= startSec) {
    startSec = Math.max(0, endSec - 1);
  }

  return { startSec, endSec, label };
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
    setRows(clipsToDraft(clips, durationSec).map((row) => clampClipRow(row, durationSec)));
    setClipError(null);
    if (clips.length > 0 && openProp === undefined) setInternalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅跟随条目数据
  }, [item.id, item.playClips, item.playStartSec, item.playEndSec, openProp]);

  useEffect(() => {
    if (durationSec == null || durationSec <= 0) return;
    setRows((prev) => prev.map((row) => clampClipRow(row, durationSec)));
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

  const commit = async (nextRows: DraftClip[]) => {
    const clamped = nextRows.map((row) => clampClipRow(row, durationSec));
    const parsed: PlayClip[] = [];
    for (const row of clamped) {
      const endSec = normalizeEndForSave(row.endSec, durationSec);
      const blank = row.startSec === 0 && endSec == null && !row.label.trim();
      if (blank && clamped.length === 1) continue;
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
      const clamped = current.map((row) => clampClipRow(row, durationSec));
      void commit(clamped);
      return clamped;
    });
  };

  const updateRow = (index: number, patch: Partial<DraftClip>) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? clampClipRow(row, durationSec, patch) : row)),
    );
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
    setRows([clampClipRow({ startSec: 0, endSec: durationSec, label: '' }, durationSec)]);
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
    setRows((prev) => [
      ...prev,
      clampClipRow({ startSec: 0, endSec: durationSec, label: '' }, durationSec),
    ]);
  };

  if (!open && hideToggle) return null;

  const startMaxSec = (row: DraftClip) => {
    if (row.endSec != null) return Math.max(0, row.endSec - 1);
    if (durationSec != null) return Math.max(0, durationSec - 1);
    return undefined;
  };

  const endMinSec = (row: DraftClip) => row.startSec + 1;

  const endMaxSec = () => (durationSec != null ? durationSec : undefined);

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
              const startMax = startMaxSec(row);
              const endMin = endMinSec(row);
              const endMax = endMaxSec();
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
                      min={secondsToHtmlTime(0)}
                      max={startMax != null ? secondsToHtmlTime(startMax) : undefined}
                      className="bulletin-worship-clip-input"
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
                      min={secondsToHtmlTime(endMin)}
                      max={endMax != null ? secondsToHtmlTime(endMax) : undefined}
                      className="bulletin-worship-clip-input"
                      value={secondsToHtmlTime(row.endSec ?? durationSec)}
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
                          : [
                              clampClipRow(
                                { startSec: 0, endSec: durationSec, label: '' },
                                durationSec,
                              ),
                            ];
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
