import { useEffect, useRef } from 'react';
import { recordYoutubePlay } from '../api/youtube-trending';

type UseRecordYoutubePlayOptions = {
  videoId?: string;
  title?: string;
  channelTitle?: string | null;
  playing: boolean;
  enabled?: boolean;
};

export function useRecordYoutubePlay({
  videoId,
  title,
  channelTitle,
  playing,
  enabled = true,
}: UseRecordYoutubePlayOptions) {
  const lastStartedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !playing || !videoId || !title?.trim()) return;
    if (lastStartedRef.current === videoId) return;
    lastStartedRef.current = videoId;

    void recordYoutubePlay({ videoId, title, channelTitle }).catch(() => {
      lastStartedRef.current = null;
    });
  }, [enabled, playing, videoId, title, channelTitle]);

  useEffect(() => {
    if (!playing) {
      lastStartedRef.current = null;
    }
  }, [playing]);
}
