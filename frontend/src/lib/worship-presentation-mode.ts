export type WorshipPresentationMode = 'ppt' | 'youtube' | 'ppt_youtube';

export type PlayClip = {
  startSec: number;
  endSec: number | null;
  label?: string | null;
};

export const WORSHIP_PRESENTATION_MODES: WorshipPresentationMode[] = [
  'ppt',
  'youtube',
  'ppt_youtube',
];

export function normalizeWorshipPresentationMode(
  value: unknown,
  fallback: WorshipPresentationMode = 'youtube',
): WorshipPresentationMode {
  return value === 'ppt' || value === 'youtube' || value === 'ppt_youtube' ? value : fallback;
}

export function worshipNeedsPlaylist(mode: WorshipPresentationMode): boolean {
  return mode === 'youtube' || mode === 'ppt_youtube';
}

export function worshipNeedsLyricsPptx(mode: WorshipPresentationMode): boolean {
  return mode === 'ppt' || mode === 'ppt_youtube';
}

/** mm:ss / m:ss / h:mm:ss 或纯秒数 → 整数秒；空 → null；非法 → 'invalid' */
export function parseClipTimeInput(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return 'invalid';
    return n;
  }

  // h:mm:ss 或 m:ss（秒必须 00–59）
  const parts = trimmed.match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  if (!parts) return 'invalid';

  if (parts[3] !== undefined) {
    const hours = Number(parts[1]);
    const minutes = Number(parts[2]);
    const seconds = Number(parts[3]);
    if (![hours, minutes, seconds].every((n) => Number.isFinite(n) && n >= 0)) return 'invalid';
    return hours * 3600 + minutes * 60 + seconds;
  }

  const minutes = Number(parts[1]);
  const seconds = Number(parts[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0) return 'invalid';
  return minutes * 60 + seconds;
}

/** 输入是否为合法时间（空视为合法，表示未填/整首） */
export function isClipTimeInputValid(raw: string): boolean {
  return parseClipTimeInput(raw) !== 'invalid';
}

export function formatClipTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function resolvePlayClips(item: {
  playClips?: PlayClip[] | null;
  playStartSec?: number | null;
  playEndSec?: number | null;
}): PlayClip[] {
  if (Array.isArray(item.playClips) && item.playClips.length > 0) {
    return item.playClips.filter(
      (c) =>
        typeof c?.startSec === 'number' &&
        Number.isFinite(c.startSec) &&
        c.startSec >= 0 &&
        (c.endSec == null || (typeof c.endSec === 'number' && c.endSec > c.startSec)),
    );
  }
  if (item.playStartSec != null || item.playEndSec != null) {
    const startSec = item.playStartSec ?? 0;
    const endSec = item.playEndSec ?? null;
    if (endSec != null && endSec <= startSec) return [];
    return [{ startSec, endSec, label: null }];
  }
  return [];
}

export function formatClipSummary(clip: PlayClip): string {
  const start = formatClipTime(clip.startSec) || '0:00';
  const end = clip.endSec == null ? '—' : formatClipTime(clip.endSec) || '—';
  return clip.label ? `${clip.label} ${start}–${end}` : `${start}–${end}`;
}
