import type { CaptionCue } from '../api/youtube-captions';

const CUE_EDGE_TOLERANCE_SEC = 0.05;
/** LRC 普遍比人声早，滞后一点才不会「歌词跑太快」。 */
const LYRIC_LAG_SEC = 0.55;
const MIN_LINE_SEC = 1.7;
const MAX_WORD_SEC = 1.2;
const MAX_MERGED_CHARS = 22;

function joinLyricText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const cjk = /[\u3400-\u9fff]$/.test(left) || /^[\u3400-\u9fff]/.test(right);
  if (cjk || left.endsWith(' ') || right.startsWith(' ')) return `${left}${right}`;
  return `${left} ${right}`;
}

/** 把逐字/过短的时间轴合成一句，避免歌词一闪而过。 */
export function mergeShortLyricCues(cues: CaptionCue[]): CaptionCue[] {
  if (cues.length < 2) return cues.map((cue) => ({ ...cue }));

  const merged: CaptionCue[] = [];
  for (const cue of cues) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push({ ...cue });
      continue;
    }
    const prevDur = prev.end - prev.start;
    const cueDur = Math.max(0, cue.end - cue.start);
    const gap = cue.start - prev.end;
    const joined = joinLyricText(prev.text, cue.text);
    const wordLike = cue.text.trim().length <= 4 || cueDur <= MAX_WORD_SEC;
    const canMerge =
      joined.length <= MAX_MERGED_CHARS &&
      gap <= 0.4 &&
      (prevDur < MIN_LINE_SEC || wordLike) &&
      (wordLike || prev.text.trim().length <= 12);
    if (canMerge) {
      prev.text = joined;
      prev.end = Math.max(prev.end, cue.end);
    } else {
      merged.push({ ...cue });
    }
  }

  for (let i = 0; i < merged.length; i++) {
    const line = merged[i]!;
    const next = merged[i + 1];
    const holdEnd = line.start + MIN_LINE_SEC;
    line.end = next ? Math.max(line.end, Math.min(holdEnd, next.start)) : Math.max(line.end, holdEnd);
  }
  return merged;
}

function cueContainsTime(cue: CaptionCue, currentTime: number): boolean {
  return (
    currentTime >= cue.start - CUE_EDGE_TOLERANCE_SEC &&
    currentTime < cue.end + CUE_EDGE_TOLERANCE_SEC
  );
}

/** 重叠 cue 取最晚开始的一条，避免旧行盖住当前歌词。 */
export function findActiveCueIndex(cues: CaptionCue[], currentTime: number): number {
  if (!cues.length || !Number.isFinite(currentTime)) return -1;
  const clock = currentTime - LYRIC_LAG_SEC;

  let active = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cueContainsTime(cues[i]!, clock)) active = i;
  }
  if (active >= 0) return active;

  for (let i = cues.length - 1; i >= 0; i--) {
    const cue = cues[i]!;
    const next = cues[i + 1];
    if (clock < cue.start - CUE_EDGE_TOLERANCE_SEC) continue;
    if (next && clock >= next.start - CUE_EDGE_TOLERANCE_SEC) continue;
    return i;
  }
  return -1;
}
