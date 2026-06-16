import { useCallback, useEffect, useState, type RefObject } from 'react';

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitExitFullscreen?: () => void;
};

function isTheaterFullscreen(theater: HTMLElement | null): boolean {
  if (!theater) return false;
  const doc = document as FullscreenDoc;
  return document.fullscreenElement === theater || doc.webkitFullscreenElement === theater;
}

function isVideoNativeFullscreen(video: HTMLVideoElement | null): boolean {
  return Boolean((video as FullscreenVideo | null)?.webkitDisplayingFullscreen);
}

export function useVipVideoFullscreen(
  theaterRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const syncState = useCallback(() => {
    setIsFullscreen(
      isTheaterFullscreen(theaterRef.current) || isVideoNativeFullscreen(videoRef.current),
    );
  }, [theaterRef, videoRef]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', syncState);
    document.addEventListener('webkitfullscreenchange', syncState);
    const video = videoRef.current;
    video?.addEventListener('webkitbeginfullscreen', syncState);
    video?.addEventListener('webkitendfullscreen', syncState);
    return () => {
      document.removeEventListener('fullscreenchange', syncState);
      document.removeEventListener('webkitfullscreenchange', syncState);
      video?.removeEventListener('webkitbeginfullscreen', syncState);
      video?.removeEventListener('webkitendfullscreen', syncState);
    };
  }, [syncState, videoRef]);

  const exitFullscreen = useCallback(async () => {
    const doc = document as FullscreenDoc;
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } catch {
        /* ignore */
      }
    }
    const video = videoRef.current as FullscreenVideo | null;
    if (video?.webkitDisplayingFullscreen) {
      try {
        video.webkitExitFullscreen?.();
      } catch {
        /* ignore */
      }
    }
    syncState();
  }, [videoRef, syncState]);

  const enterFullscreen = useCallback(async () => {
    const theater = theaterRef.current as FullscreenElement | null;
    if (theater) {
      try {
        if (theater.requestFullscreen) await theater.requestFullscreen();
        else await theater.webkitRequestFullscreen?.();
        syncState();
        return;
      } catch {
        /* iOS 等可能不支持容器全屏，回退到 video 原生全屏 */
      }
    }
    const video = videoRef.current as FullscreenVideo | null;
    video?.webkitEnterFullscreen?.();
    syncState();
  }, [theaterRef, videoRef, syncState]);

  const toggleFullscreen = useCallback(async () => {
    if (isTheaterFullscreen(theaterRef.current) || isVideoNativeFullscreen(videoRef.current)) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }, [theaterRef, videoRef, exitFullscreen, enterFullscreen]);

  return { isFullscreen, toggleFullscreen, exitFullscreen, enterFullscreen };
}
