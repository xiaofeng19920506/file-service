import type { SubtitleLanguage } from '../lib/subtitle-preference';
import { apiFetch, parseJson } from './http';

export type CaptionCue = {
  start: number;
  end: number;
  text: string;
};

export type VideoCaptions = {
  videoId: string;
  language: string;
  sourceLanguage: string | null;
  translated: boolean;
  cues: CaptionCue[];
};

export async function fetchVideoCaptions(
  videoId: string,
  subtitleLang: SubtitleLanguage,
): Promise<VideoCaptions> {
  const params = new URLSearchParams({ subtitleLang });
  const res = await apiFetch(
    `/v1/youtube/videos/${encodeURIComponent(videoId)}/captions?${params}`,
  );
  return parseJson<VideoCaptions>(res);
}

export function findActiveCaption(cues: CaptionCue[], currentTime: number): string | null {
  if (!cues.length || !Number.isFinite(currentTime)) return null;
  const cue = cues.find(
    (row) => currentTime >= row.start - 0.05 && currentTime < row.end + 0.05,
  );
  return cue?.text ?? null;
}
