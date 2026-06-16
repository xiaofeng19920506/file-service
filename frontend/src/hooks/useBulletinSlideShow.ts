import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBulletinSlidePreviewPng,
  fetchBulletinTemplateMap,
  type BulletinSlidePreviewParams,
} from '../api/bulletins';
import { createSlideShowBus, type SlideShowRole } from '../lib/bulletin-slideshow-bus';

const FALLBACK_TOTAL_SLIDES = 38;

export function useBulletinSlideShow(opts: {
  sessionId: string;
  role: SlideShowRole;
  patch: BulletinSlidePreviewParams;
  initialSlide: number;
  initialTotalSlides?: number;
}) {
  const { sessionId, role, patch, initialSlide, initialTotalSlides = FALLBACK_TOTAL_SLIDES } = opts;
  const urlCacheRef = useRef<Map<number, string>>(new Map());
  const [totalSlides, setTotalSlides] = useState(initialTotalSlides);
  const [currentSlide, setCurrentSlide] = useState(initialSlide);
  const [slideUrls, setSlideUrls] = useState<Record<number, string>>({});
  const [loadingSlides, setLoadingSlides] = useState<Set<number>>(new Set());
  const [failedSlides, setFailedSlides] = useState<Set<number>>(new Set());
  const stateRef = useRef({ currentSlide: initialSlide, totalSlides: initialTotalSlides });
  stateRef.current = { currentSlide, totalSlides };

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
        const blob = await fetchBulletinSlidePreviewPng(slideNumber, patch);
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
    void fetchBulletinTemplateMap()
      .then((map) => {
        if (map.totalSlides > 0) setTotalSlides(map.totalSlides);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadSlide(currentSlide).catch(() => undefined);
    for (const nearby of [currentSlide - 1, currentSlide + 1, currentSlide + 2]) {
      if (nearby >= 1 && nearby <= totalSlides) {
        void loadSlide(nearby).catch(() => undefined);
      }
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
    const next = Math.max(1, stateRef.current.currentSlide - 1);
    setCurrentSlide(next);
    if (role === 'presenter') publishSync(next);
  }, [publishSync, role]);

  const goNext = useCallback(() => {
    const next = Math.min(totalSlides, stateRef.current.currentSlide + 1);
    setCurrentSlide(next);
    if (role === 'presenter') publishSync(next);
  }, [publishSync, role, totalSlides]);

  const goToSlide = useCallback(
    (slide: number) => {
      const next = Math.min(totalSlides, Math.max(1, slide));
      setCurrentSlide(next);
      if (role === 'presenter') publishSync(next);
    },
    [publishSync, role, totalSlides],
  );

  const endShow = useCallback(() => {
    const bus = createSlideShowBus(sessionId);
    bus.publish({ type: 'close', from: role });
    bus.close();
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
    nextSlide: currentSlide < totalSlides ? currentSlide + 1 : null,
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
