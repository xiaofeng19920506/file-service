import type { CaptionCue } from '../api/youtube-captions';

export function findActiveCueIndex(cues: CaptionCue[], currentTime: number): number {
  if (!cues.length || !Number.isFinite(currentTime)) return -1;
  const exact = cues.findIndex(
    (cue) => currentTime >= cue.start - 0.05 && currentTime < cue.end + 0.05,
  );
  if (exact >= 0) return exact;
  for (let i = cues.length - 1; i >= 0; i--) {
    if (currentTime >= cues[i]!.start - 0.05) return i;
  }
  return -1;
}
