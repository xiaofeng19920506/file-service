export type PlayClip = {
  startSec: number;
  endSec: number | null;
  label?: string | null;
};

/** `<input type="time" step="1">` 的 value（HH:MM:SS）；null → 空 */
export function secondsToHtmlTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.min(Math.floor(seconds), 23 * 3600 + 59 * 60 + 59);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** HTML time value → 秒；空 → null；非法 → 'invalid' */
export function htmlTimeToSeconds(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return 'invalid';
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = m[3] !== undefined ? Number(m[3]) : 0;
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n) && n >= 0) || hours > 23) {
    return 'invalid';
  }
  return hours * 3600 + minutes * 60 + seconds;
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

/**
 * 新切段默认起点：上一段结束时间 + 1 秒（例如上一段到 1:00 → 新段从 1:01）。
 * 上一段未设结束时，若有总时长则从片尾起（随后由 UI clamp）；否则为上一段起点 + 1。
 */
export function defaultNextClipStartSec(
  previous: { startSec: number; endSec: number | null },
  durationSec?: number | null,
): number {
  if (previous.endSec != null && Number.isFinite(previous.endSec)) {
    return Math.max(0, Math.floor(previous.endSec) + 1);
  }
  if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
    return Math.floor(durationSec);
  }
  return Math.max(0, Math.floor(previous.startSec) + 1);
}

/**
 * 是否还能再加一段：上一段结束后至少还需 1 秒可用时长。
 * 上一段已到片尾（end 为空或等于总时长）时返回 false。
 */
export function canAddNextClipSegment(
  previous: { startSec: number; endSec: number | null } | null | undefined,
  durationSec?: number | null,
): boolean {
  if (!previous) {
    if (durationSec == null || !Number.isFinite(durationSec)) return true;
    return Math.floor(durationSec) > 1;
  }
  // 未设结束且不知总时长：视为已到片尾，无法再切
  if (
    previous.endSec == null
    && (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0)
  ) {
    return false;
  }
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return true;
  }
  const duration = Math.floor(durationSec);
  const nextStart = defaultNextClipStartSec(previous, duration);
  return nextStart <= duration - 1;
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
  let end = endSeconds ?? null;
  if (end != null) {
    end = Math.min(end, duration);
    if (end <= start) end = null;
  }
  return { startSeconds: start, endSeconds: end };
}

export type YoutubeClipPlayerItem = {
  youtubeVideoId: string;
  title: string;
  startSeconds: number | null;
  endSeconds: number | null;
};

/** 歌单项 → 播放队列；expandClips 时多段剪切拆成连续多条 */
export function toYoutubePlayerItems(
  items: Array<{
    youtubeVideoId?: string | null;
    title: string;
    playClips?: PlayClip[] | null;
    playStartSec?: number | null;
    playEndSec?: number | null;
  }>,
  opts?: { expandClips?: boolean },
): YoutubeClipPlayerItem[] {
  const expandClips = opts?.expandClips !== false;
  const out: YoutubeClipPlayerItem[] = [];
  for (const item of items) {
    if (!item.youtubeVideoId) continue;
    const clips = resolvePlayClips(item);
    if (clips.length === 0) {
      out.push({
        youtubeVideoId: item.youtubeVideoId,
        title: item.title,
        startSeconds: null,
        endSeconds: null,
      });
      continue;
    }
    const list = expandClips ? clips : [clips[0]!];
    list.forEach((clip, index) => {
      const segLabel =
        clip.label?.trim() ||
        (expandClips && clips.length > 1 ? `${index + 1}/${clips.length}` : null);
      out.push({
        youtubeVideoId: item.youtubeVideoId!,
        title: segLabel ? `${item.title} (${segLabel})` : item.title,
        startSeconds: clip.startSec,
        endSeconds: clip.endSec,
      });
    });
  }
  return out;
}
