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

/** mm:ss or m:ss or plain seconds → integer seconds; empty → null */
export function parseClipTimeInput(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : 'invalid';
  }
  const m = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (!m) return 'invalid';
  const minutes = Number(m[1]);
  const seconds = Number(m[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 'invalid';
  return minutes * 60 + seconds;
}

export function formatClipTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
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
