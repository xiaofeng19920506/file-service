import type { CaptionCue } from '../api/youtube-captions';

const CUE_EDGE_TOLERANCE_SEC = 0.05;

function cueContainsTime(cue: CaptionCue, currentTime: number): boolean {
  return (
    currentTime >= cue.start - CUE_EDGE_TOLERANCE_SEC &&
    currentTime < cue.end + CUE_EDGE_TOLERANCE_SEC
  );
}

/** 重叠 cue 取最晚开始的一条，避免旧行盖住当前歌词。 */
export function findActiveCueIndex(cues: CaptionCue[], currentTime: number): number {
  if (!cues.length || !Number.isFinite(currentTime)) return -1;

  let active = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cueContainsTime(cues[i]!, currentTime)) active = i;
  }
  if (active >= 0) return active;

  for (let i = cues.length - 1; i >= 0; i--) {
    const cue = cues[i]!;
    const next = cues[i + 1];
    if (currentTime < cue.start - CUE_EDGE_TOLERANCE_SEC) continue;
    if (next && currentTime >= next.start - CUE_EDGE_TOLERANCE_SEC) continue;
    return i;
  }
  return -1;
}
