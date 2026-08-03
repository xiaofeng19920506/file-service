export const WORSHIP_PRESENTATION_MODES = ['ppt', 'youtube', 'ppt_youtube'] as const;

export type WorshipPresentationMode = (typeof WORSHIP_PRESENTATION_MODES)[number];

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
