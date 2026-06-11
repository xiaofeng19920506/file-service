import { useEffect, useRef } from 'react';

export type MediaSessionTrack = {
  title: string;
  artist: string;
  album?: string;
  videoId: string;
};

export type MediaSessionHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
};

function youtubeArtwork(videoId: string): MediaImage[] {
  const id = videoId;
  return [
    { src: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
    { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
    { src: `https://i.ytimg.com/vi/${id}/sddefault.jpg`, sizes: '640x480', type: 'image/jpeg' },
  ];
}

function setActionHandler(
  mediaSession: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
) {
  try {
    mediaSession.setActionHandler(action, handler);
  } catch {
    /* 部分浏览器不支持该 action */
  }
}

export function useMediaSession(
  enabled: boolean,
  playing: boolean,
  track: MediaSessionTrack | null,
  currentTime: number,
  duration: number,
  handlers: MediaSessionHandlers,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;

    const onPlay = () => handlersRef.current.onPlay();
    const onPause = () => handlersRef.current.onPause();
    const onPrevious = () => {
      if (handlersRef.current.canGoPrev) handlersRef.current.onPreviousTrack();
    };
    const onNext = () => {
      if (handlersRef.current.canGoNext) handlersRef.current.onNextTrack();
    };

    setActionHandler(mediaSession, 'play', onPlay);
    setActionHandler(mediaSession, 'pause', onPause);
    setActionHandler(mediaSession, 'previoustrack', onPrevious);
    setActionHandler(mediaSession, 'nexttrack', onNext);
    // 部分车载系统用 seek 动作代替切歌
    setActionHandler(mediaSession, 'seekbackward', onPrevious);
    setActionHandler(mediaSession, 'seekforward', onNext);

    return () => {
      setActionHandler(mediaSession, 'play', null);
      setActionHandler(mediaSession, 'pause', null);
      setActionHandler(mediaSession, 'previoustrack', null);
      setActionHandler(mediaSession, 'nexttrack', null);
      setActionHandler(mediaSession, 'seekbackward', null);
      setActionHandler(mediaSession, 'seekforward', null);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !track || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      artwork: youtubeArtwork(track.videoId),
    });
  }, [enabled, track?.title, track?.artist, track?.album, track?.videoId]);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }, [enabled, playing]);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    if (!Number.isFinite(duration) || duration <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(0, currentTime), duration),
      });
    } catch {
      /* setPositionState 在部分环境下会抛错 */
    }
  }, [enabled, currentTime, duration]);

  useEffect(() => {
    if (enabled) return;

    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  }, [enabled]);
}
