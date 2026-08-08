import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBulletinSlidePreviewPng,
  type BulletinSlidePreviewParams,
} from '../api/bulletins';
import { createSlideShowBus, type SlideShowRole } from '../lib/bulletin-slideshow-bus';
import { removeSlideShowSession } from '../lib/bulletin-slideshow-session';
import {
  coercePresentableSlide,
  normalizeSkipSlides,
  stepPresentableSlide,
} from '../lib/bulletin-slideshow-navigation';

const FALLBACK_TOTAL_SLIDES = 38;

export function useBulletinSlideShow(opts: {
  sessionId: string;
  role: SlideShowRole;
  patch: BulletinSlidePreviewParams;
  initialSlide: number;
  initialTotalSlides?: number;
  skipSlides?: number[];
}) {
  const {
    sessionId,
    role,
    patch,
    initialSlide,
    initialTotalSlides = FALLBACK_TOTAL_SLIDES,
    skipSlides,
  } = opts;
  const skipSet = useMemo(() => normalizeSkipSlides(skipSlides), [skipSlides]);
  const urlCacheRef = useRef<Map<number, string>>(new Map());
  const [totalSlides, setTotalSlides] = useState(initialTotalSlides);
  const [currentSlide, setCurrentSlide] = useState(() =>
    coercePresentableSlide(initialSlide, initialTotalSlides, normalizeSkipSlides(skipSlides)),
  );
  const [slideUrls, setSlideUrls] = useState<Record<number, string>>({});
  const [loadingSlides, setLoadingSlides] = useState<Set<number>>(new Set());
  const [failedSlides, setFailedSlides] = useState<Set<number>>(new Set());
  const stateRef = useRef({ currentSlide, totalSlides });
  stateRef.current = { currentSlide, totalSlides };
  const skipRef = useRef(skipSet);
  skipRef.current = skipSet;

  const revokeCache = useCallback(() => {
    for (const url of urlCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    urlCacheRef.current.clear();
  }, []);

  const loadSlide = useCallback(
    async (slideNumber: number) => {
      const cached = urlCacheRef.current.get(slideNumber);
      if (cached) return cached;
      setLoadingSlides((prev) => new Set(prev).add(slideNumber));
      setFailedSlides((prev) => {
        const next = new Set(prev);
        next.delete(slideNumber);
        return next;
      });
      try {
        const blob = await fetchBulletinSlidePreviewPng(slideNumber, patch, {
          priority: 'high',
        });
        const url = URL.createObjectURL(blob);
        urlCacheRef.current.set(slideNumber, url);
        setSlideUrls((prev) => ({ ...prev, [slideNumber]: url }));
        return url;
      } catch {
        setFailedSlides((prev) => new Set(prev).add(slideNumber));
        throw new Error('slide_load_failed');
      } finally {
        setLoadingSlides((prev) => {
          const next = new Set(prev);
          next.delete(slideNumber);
          return next;
        });
      }
    },
    [patch],
  );

  useEffect(() => {
    void loadSlide(currentSlide).catch(() => undefined);
    const skip = skipRef.current;
    const nearby: number[] = [];
    let probe = currentSlide;
    for (let i = 0; i < 3; i++) {
      probe = stepPresentableSlide(probe, 1, totalSlides, skip);
      if (probe === nearby[nearby.length - 1] || probe === currentSlide) break;
      nearby.push(probe);
    }
    probe = currentSlide;
    for (let i = 0; i < 1; i++) {
      probe = stepPresentableSlide(probe, -1, totalSlides, skip);
      if (probe === currentSlide) break;
      nearby.push(probe);
    }
    for (const n of nearby) {
      void loadSlide(n).catch(() => undefined);
    }
  }, [currentSlide, loadSlide, totalSlides]);

  useEffect(() => {
    const bus = createSlideShowBus(sessionId);
    const unsubscribe = bus.subscribe((message) => {
      if (message.type === 'sync' && message.from !== role) {
        setCurrentSlide(message.currentSlide);
        setTotalSlides(message.totalSlides);
      }
      if (message.type === 'request-sync' && role === 'presenter') {
        bus.publish({
          type: 'sync',
          currentSlide: stateRef.current.currentSlide,
          totalSlides: stateRef.current.totalSlides,
          from: 'presenter',
        });
      }
      if (message.type === 'close' && message.from !== role) {
        window.close();
      }
    });

    if (role === 'presenter') {
      bus.publish({
        type: 'sync',
        currentSlide: stateRef.current.currentSlide,
        totalSlides: stateRef.current.totalSlides,
        from: 'presenter',
      });
    } else {
      // 投影窗启动时也广播当前页，方便主周报页跟随左侧分区
      bus.publish({
        type: 'sync',
        currentSlide: stateRef.current.currentSlide,
        totalSlides: stateRef.current.totalSlides,
        from: 'projector',
      });
      bus.publish({ type: 'request-sync', from: 'projector' });
    }

    return () => {
      unsubscribe();
      bus.close();
    };
  }, [sessionId, role]);

  useEffect(() => () => revokeCache(), [revokeCache]);

  const publishSync = useCallback(
    (slide: number, total: number = totalSlides) => {
      const bus = createSlideShowBus(sessionId);
      bus.publish({ type: 'sync', currentSlide: slide, totalSlides: total, from: role });
      bus.close();
    },
    [sessionId, role, totalSlides],
  );

  const goPrev = useCallback(() => {
    const next = stepPresentableSlide(
      stateRef.current.currentSlide,
      -1,
      stateRef.current.totalSlides,
      skipRef.current,
    );
    setCurrentSlide(next);
    publishSync(next);
  }, [publishSync]);

  const goNext = useCallback(() => {
    const next = stepPresentableSlide(
      stateRef.current.currentSlide,
      1,
      stateRef.current.totalSlides,
      skipRef.current,
    );
    setCurrentSlide(next);
    publishSync(next);
  }, [publishSync]);

  const goToSlide = useCallback(
    (slide: number) => {
      const next = coercePresentableSlide(
        slide,
        stateRef.current.totalSlides,
        skipRef.current,
      );
      setCurrentSlide(next);
      publishSync(next);
    },
    [publishSync],
  );

  const endShow = useCallback(() => {
    const bus = createSlideShowBus(sessionId);
    bus.publish({ type: 'close', from: role });
    bus.close();
    // 显式结束才删 session；单窗刷新/pagehide 不删
    removeSlideShowSession(sessionId);
    window.close();
  }, [sessionId, role]);

  const requestProjectorFullscreen = useCallback(() => {
    const bus = createSlideShowBus(sessionId);
    bus.publish({ type: 'fullscreen', from: 'presenter' });
    bus.close();
  }, [sessionId]);

  return {
    totalSlides,
    currentSlide,
    nextSlide: (() => {
      const n = stepPresentableSlide(currentSlide, 1, totalSlides, skipSet);
      return n === currentSlide ? null : n;
    })(),
    slideUrls,
    loadingSlides,
    failedSlides,
    loadSlide,
    goPrev,
    goNext,
    goToSlide,
    endShow,
    requestProjectorFullscreen,
  };
}
