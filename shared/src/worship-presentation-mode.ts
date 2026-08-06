export const WORSHIP_PRESENTATION_MODES = ['ppt', 'youtube', 'ppt_youtube'] as const;

export type WorshipPresentationMode = (typeof WORSHIP_PRESENTATION_MODES)[number];

export type PlayClip = {
  /** 片段起点（秒，含） */
  startSec: number;
  /** 片段终点（秒）；null 表示播到曲终 */
  endSec: number | null;
  /** 可选段落名，如「副歌」 */
  label?: string | null;
};

export function isWorshipPresentationMode(value: unknown): value is WorshipPresentationMode {
  return (
    typeof value === 'string' &&
    (WORSHIP_PRESENTATION_MODES as readonly string[]).includes(value)
  );
}

export function normalizeWorshipPresentationMode(
  value: unknown,
  fallback: WorshipPresentationMode = 'youtube',
): WorshipPresentationMode {
  return isWorshipPresentationMode(value) ? value : fallback;
}

/** 校验可选片段起止秒；返回规范化后的值或 error code */
export function parsePlayClipSeconds(input: {
  playStartSec?: unknown;
  playEndSec?: unknown;
  clearStart?: boolean;
  clearEnd?: boolean;
}):
  | { ok: true; playStartSec: number | null | undefined; playEndSec: number | null | undefined }
  | { ok: false; error: string } {
  let playStartSec: number | null | undefined = undefined;
  let playEndSec: number | null | undefined = undefined;

  if (input.clearStart) playStartSec = null;
  else if (input.playStartSec !== undefined) {
    if (input.playStartSec === null) playStartSec = null;
    else {
      const n = Number(input.playStartSec);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return { ok: false, error: 'play_start_invalid' };
      }
      playStartSec = n;
    }
  }

  if (input.clearEnd) playEndSec = null;
  else if (input.playEndSec !== undefined) {
    if (input.playEndSec === null) playEndSec = null;
    else {
      const n = Number(input.playEndSec);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return { ok: false, error: 'play_end_invalid' };
      }
      playEndSec = n;
    }
  }

  return { ok: true, playStartSec, playEndSec };
}

export function assertClipRange(
  start: number | null | undefined,
  end: number | null | undefined,
): string | null {
  if (start != null && end != null && end <= start) return 'play_clip_range_invalid';
  return null;
}

export function clipExceedsDuration(
  clip: { startSec: number; endSec: number | null },
  durationSec: number,
): boolean {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return false;
  if (clip.startSec >= durationSec) return true;
  if (clip.endSec != null && clip.endSec > durationSec) return true;
  return false;
}

export function assertClipsWithinDuration(
  clips: PlayClip[] | null | undefined,
  durationSec: number | null | undefined,
): string | null {
  if (!clips?.length) return null;
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  for (const clip of clips) {
    if (clipExceedsDuration(clip, durationSec)) return 'play_clip_exceeds_duration';
  }
  return null;
}

/** 播放/切歌时把片段起止限制在视频时长内 */
export function clampPlaybackBounds(
  startSeconds: number | null | undefined,
  endSeconds: number | null | undefined,
  durationSec: number,
): { startSeconds: number; endSeconds: number | null } {
  const duration = Math.max(0, Math.floor(durationSec));
  const rawStart = Math.max(0, startSeconds ?? 0);
  if (duration <= 0) {
    return { startSeconds: rawStart, endSeconds: endSeconds ?? null };
  }
  let start = rawStart >= duration ? Math.max(0, duration - 1) : rawStart;
  let end: number | null = endSeconds ?? null;
  if (end != null) {
    end = Math.min(end, duration);
    if (end <= start) end = null;
  }
  return { startSeconds: start, endSeconds: end };
}

function parseOneClip(raw: unknown): PlayClip | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const startN = Number(row.startSec);
  if (!Number.isFinite(startN) || startN < 0 || !Number.isInteger(startN)) return null;
  let endSec: number | null = null;
  if (row.endSec !== undefined && row.endSec !== null) {
    const endN = Number(row.endSec);
    if (!Number.isFinite(endN) || endN < 0 || !Number.isInteger(endN) || endN <= startN) {
      return null;
    }
    endSec = endN;
  }
  const label =
    typeof row.label === 'string' && row.label.trim() ? row.label.trim().slice(0, 80) : null;
  return { startSec: startN, endSec, label };
}

/** 解析多段剪切；`null`/`[]` 表示整首；非法结构返回 error */
export function parsePlayClips(input: unknown):
  | { ok: true; playClips: PlayClip[] | null }
  | { ok: false; error: string } {
  if (input === undefined) {
    return { ok: false, error: 'play_clips_invalid' };
  }
  if (input === null) {
    return { ok: true, playClips: null };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: 'play_clips_invalid' };
  }
  if (input.length === 0) {
    return { ok: true, playClips: null };
  }
  if (input.length > 40) {
    return { ok: false, error: 'play_clips_too_many' };
  }
  const clips: PlayClip[] = [];
  for (const row of input) {
    const clip = parseOneClip(row);
    if (!clip) return { ok: false, error: 'play_clips_invalid' };
    clips.push(clip);
  }
  return { ok: true, playClips: clips };
}

/** 优先用 playClips；否则回退单段 playStart/End */
export function resolvePlayClips(item: {
  playClips?: PlayClip[] | null;
  playStartSec?: number | null;
  playEndSec?: number | null;
}): PlayClip[] {
  if (Array.isArray(item.playClips) && item.playClips.length > 0) {
    return item.playClips.map((c) => parseOneClip(c)).filter((c): c is PlayClip => c != null);
  }
  if (item.playStartSec != null || item.playEndSec != null) {
    const startSec = item.playStartSec ?? 0;
    const endSec = item.playEndSec ?? null;
    if (endSec != null && endSec <= startSec) return [];
    return [{ startSec, endSec, label: null }];
  }
  return [];
}

export function clipsToLegacyStartEnd(clips: PlayClip[] | null | undefined): {
  playStartSec: number | null;
  playEndSec: number | null;
} {
  const first = clips?.[0];
  if (!first) return { playStartSec: null, playEndSec: null };
  return { playStartSec: first.startSec, playEndSec: first.endSec };
}
