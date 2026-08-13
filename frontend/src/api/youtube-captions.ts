import { findActiveCueIndex } from '../lib/caption-cues';
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
  generating?: boolean;
};

function isRetryableCaptionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg === 'captions_fetch_failed' ||
    msg === 'api_unavailable' ||
    msg === 'caption_blocked' ||
    /failed to fetch|network|timeout|abort/i.test(msg)
  );
}

async function fetchVideoCaptionsOnce(
  videoId: string,
  subtitleLang: SubtitleLanguage,
  title?: string,
): Promise<VideoCaptions> {
  const params = new URLSearchParams({ subtitleLang });
  const trimmedTitle = title?.trim();
  if (trimmedTitle) params.set('title', trimmedTitle);
  const res = await apiFetch(
    `/v1/youtube/videos/${encodeURIComponent(videoId)}/captions?${params}`,
    { signal: AbortSignal.timeout(20_000) },
  );
  return parseJson<VideoCaptions>(res);
}

export async function fetchVideoCaptions(
  videoId: string,
  subtitleLang: SubtitleLanguage,
  title?: string,
): Promise<VideoCaptions> {
  try {
    return await fetchVideoCaptionsOnce(videoId, subtitleLang, title);
  } catch (err) {
    if (!isRetryableCaptionError(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return fetchVideoCaptionsOnce(videoId, subtitleLang, title);
  }
}

export function findActiveCaption(cues: CaptionCue[], currentTime: number): string | null {
  const index = findActiveCueIndex(cues, currentTime);
  return index >= 0 ? (cues[index]?.text ?? null) : null;
}
