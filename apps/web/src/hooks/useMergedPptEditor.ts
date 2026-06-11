import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { updateJobOutput } from '../api/client';
import { useSlideHistory } from './useSlideHistory';
import {
  applyBatchRemove,
  canRemoveSlide,
  cloneSlides,
  validateBatchRemove,
} from '../lib/slide-history';
import {
  applySlideEditsToPptx,
  createSlidePlaceholder,
  parsePptxSlidesDetailed,
  reindexSlides,
  revokeSlideUrls,
  slideDisplayImageUrl,
  slideIdentity,
  slidesContentEqual,
  type EditableSlide,
} from '../lib/pptx-preview';

type UseMergedPptEditorProps = {
  mergedUrl: string | null;
  jobId: string | null;
  onSaved?: () => void;
};

type SkipConfirmState = { kind: 'one'; index: number } | { kind: 'batch' } | null;
type CropTargetState = { arrayIndex: number; imageIndex: number; url: string } | null;

function normalizeFetchUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname.startsWith('/v1/')) return `${u.pathname}${u.search}`;
  } catch {
    /* keep original */
  }
  return url;
}

export function useMergedPptEditor({ mergedUrl, jobId, onSaved }: UseMergedPptEditorProps) {
  const {
    slides,
    replaceSlides,
    updateSlides: historyUpdateSlides,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useSlideHistory();
  const [savedSlides, setSavedSlides] = useState<EditableSlide[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedSlideIds, setSelectedSlideIds] = useState<Set<string>>(() => new Set());
  const [cropTarget, setCropTarget] = useState<CropTargetState>(null);
  const [skipConfirm, setSkipConfirm] = useState<SkipConfirmState>(null);
  const [pptDragIndex, setPptDragIndex] = useState<number | null>(null);
  const [pptDragOverIndex, setPptDragOverIndex] = useState<number | null>(null);
  const loadToken = useRef(0);
  const slidesRef = useRef<EditableSlide[]>([]);
  const mergedSourceFileRef = useRef<File | null>(null);

  const dirty = useMemo(() => !slidesContentEqual(slides, savedSlides), [slides, savedSlides]);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(
    () => () => {
      revokeSlideUrls(slidesRef.current);
    },
    [],
  );

  const setSlidesSafe = useCallback(
    (next: EditableSlide[]) => {
      const nextUrls = new Set(next.flatMap((s) => s.imageUrls));
      for (const s of slidesRef.current) {
        for (const url of s.imageUrls) {
          if (!nextUrls.has(url)) URL.revokeObjectURL(url);
        }
      }
      slidesRef.current = next;
      replaceSlides(next);
    },
    [replaceSlides],
  );

  const setSavedSlidesSafe = useCallback((next: EditableSlide[]) => {
    setSavedSlides(cloneSlides(next));
  }, []);

  useEffect(() => {
    if (focusIndex >= slides.length && slides.length > 0) {
      setFocusIndex(slides.length - 1);
    }
  }, [focusIndex, slides.length]);

  useEffect(() => {
    const token = ++loadToken.current;
    setLoading(true);
    setSaveError(null);
    setBatchMode(false);
    setSelectedSlideIds(new Set());
    setFocusIndex(0);

    if (!mergedUrl) {
      setSlidesSafe([]);
      setSavedSlidesSafe([]);
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(normalizeFetchUrl(mergedUrl));
        if (!res.ok) throw new Error(`download ${res.status}`);
        const blob = await res.blob();
        const parsed = await parsePptxSlidesDetailed(blob, { sourceFile: 'merged.pptx' });
        if (token !== loadToken.current) return;
        mergedSourceFileRef.current = new File([blob], 'merged.pptx', {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        });
        setSlidesSafe(parsed);
        setSavedSlidesSafe(parsed);
      } catch (e) {
        if (token !== loadToken.current) return;
        setSlidesSafe([]);
        setSavedSlidesSafe([]);
        setSaveError(e instanceof Error ? e.message : 'load_failed');
      } finally {
        if (token === loadToken.current) setLoading(false);
      }
    })();
  }, [mergedUrl, setSavedSlidesSafe, setSlidesSafe]);

  const updateSlides = useCallback(
    (updater: (prev: EditableSlide[]) => EditableSlide[]) => {
      historyUpdateSlides(updater);
    },
    [historyUpdateSlides],
  );

  const updateSlide = useCallback(
    (index: number, patch: Partial<Pick<EditableSlide, 'title' | 'snippet'>>) => {
      updateSlides((prev) => prev.map((s) => (s.index === index ? { ...s, ...patch } : s)));
    },
    [updateSlides],
  );

  const resolveInsertAfterPath = (slide: EditableSlide): string | null => {
    if (slide.slidePath) return slide.slidePath;
    if (slide.isNew && slide.insertAfterPath !== undefined) return slide.insertAfterPath;
    return null;
  };

  const reorderSlide = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      updateSlides((prev) => {
        const copy = [...prev];
        const [moved] = copy.splice(from, 1);
        copy.splice(to, 0, moved);
        return copy;
      });
    },
    [updateSlides],
  );

  const reorderSlideAt = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= slides.length || to >= slides.length) {
        return;
      }
      reorderSlide(from, to);
      setFocusIndex((i) => {
        if (i === from) return to;
        if (from < to && i > from && i <= to) return i - 1;
        if (from > to && i >= to && i < from) return i + 1;
        return i;
      });
    },
    [reorderSlide, slides.length],
  );

  const addSlideAfter = useCallback(
    (arrayIndex: number, blank: boolean) => {
      const template = slides[arrayIndex];
      if (!template) return;
      const dupPath = template.slidePath || template.duplicateFromPath;
      if (!dupPath && !template.pending) return;
      const insertAfterPath = resolveInsertAfterPath(template);
      const placeholder = createSlidePlaceholder(template, { blank, insertAfterPath });
      updateSlides((prev) => {
        const copy = [...prev];
        copy.splice(arrayIndex + 1, 0, placeholder);
        return copy;
      });
    },
    [slides, updateSlides],
  );

  const performSkipSlide = useCallback(
    (arrayIndex: number) => {
      updateSlides((prev) => prev.filter((_, i) => i !== arrayIndex));
      setFocusIndex((i) => {
        if (i > arrayIndex) return i - 1;
        if (i === arrayIndex) return Math.max(0, arrayIndex - 1);
        return i;
      });
    },
    [updateSlides],
  );

  const requestSkipSlide = useCallback(
    (arrayIndex: number) => {
      const target = slides[arrayIndex];
      if (!target || !canRemoveSlide(target, slides)) return;
      setSkipConfirm({ kind: 'one', index: arrayIndex });
    },
    [slides],
  );

  const toggleSlideSelect = useCallback(
    (arrayIndex: number) => {
      const slide = slides[arrayIndex];
      if (!slide) return;
      const id = slideIdentity(slide);
      setSelectedSlideIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [slides],
  );

  const selectAllSlides = useCallback(() => {
    setSelectedSlideIds(new Set(slides.map(slideIdentity)));
  }, [slides]);

  const clearSlideSelection = useCallback(() => {
    setSelectedSlideIds(new Set());
  }, []);

  const requestBatchSkip = useCallback(() => {
    const err = validateBatchRemove(slides, selectedSlideIds);
    if (err) {
      setSaveError(err);
      return;
    }
    setSkipConfirm({ kind: 'batch' });
  }, [selectedSlideIds, slides]);

  const performBatchSkip = useCallback(() => {
    historyUpdateSlides((prev) => applyBatchRemove(prev, selectedSlideIds));
    setSelectedSlideIds(new Set());
    setSaveError(null);
    setFocusIndex((i) => Math.min(i, Math.max(0, slides.length - selectedSlideIds.size - 1)));
  }, [historyUpdateSlides, selectedSlideIds, slides.length]);

  const setSlideImageReplacement = useCallback(
    (arrayIndex: number, imageIndex: number, blob: Blob) => {
      updateSlides((prev) =>
        prev.map((s, i) => {
          if (i !== arrayIndex) return s;
          const mediaPath = s.imageMediaPaths[imageIndex];
          if (!mediaPath) return s;
          const oldPreview = s.imagePreviewUrls?.[mediaPath];
          if (oldPreview?.startsWith('blob:')) URL.revokeObjectURL(oldPreview);
          const previewUrl = URL.createObjectURL(blob);
          return {
            ...s,
            imageReplacements: { ...(s.imageReplacements ?? {}), [mediaPath]: blob },
            imagePreviewUrls: { ...(s.imagePreviewUrls ?? {}), [mediaPath]: previewUrl },
          };
        }),
      );
    },
    [updateSlides],
  );

  const openCrop = useCallback((arrayIndex: number, imageIndex: number, url: string) => {
    setCropTarget({ arrayIndex, imageIndex, url });
  }, []);

  const discardChanges = useCallback(() => {
    for (const s of slides) {
      if (s.isNew) {
        for (const url of s.imageUrls) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        }
      }
    }
    const restored = reindexSlides(cloneSlides(savedSlides));
    replaceSlides(restored);
    setFocusIndex((i) => Math.min(i, Math.max(0, restored.length - 1)));
    setSaveError(null);
  }, [replaceSlides, savedSlides, slides]);

  const saveChanges = useCallback(async () => {
    if (!dirty || !jobId || !mergedSourceFileRef.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updatedFile = await applySlideEditsToPptx(
        mergedSourceFileRef.current,
        savedSlides,
        slides,
        { sourceFile: 'merged.pptx' },
      );
      await updateJobOutput(jobId, updatedFile);
      mergedSourceFileRef.current = updatedFile;
      const parsed = await parsePptxSlidesDetailed(updatedFile, { sourceFile: 'merged.pptx' });
      setSlidesSafe(parsed);
      setSavedSlidesSafe(parsed);
      onSaved?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'save_failed');
    } finally {
      setSaving(false);
    }
  }, [dirty, jobId, onSaved, savedSlides, setSavedSlidesSafe, setSlidesSafe, slides]);

  const pptFocusIndex = Math.min(focusIndex, Math.max(0, slides.length - 1));
  const currentSlide = slides[pptFocusIndex];

  const canSkip = !!currentSlide && canRemoveSlide(currentSlide, slides);
  const canDuplicate = !!currentSlide && !!(currentSlide.slidePath || currentSlide.duplicateFromPath);
  const canMoveUp = pptFocusIndex > 0;
  const canMoveDown = pptFocusIndex < slides.length - 1;
  const canEditImages = !!currentSlide && currentSlide.imageMediaPaths.length > 0;
  const firstImageUrl =
    currentSlide && currentSlide.imageMediaPaths.length > 0
      ? slideDisplayImageUrl(currentSlide, 0)
      : null;

  return {
    slides,
    loading,
    saving,
    saveError,
    dirty,
    focusIndex: pptFocusIndex,
    setFocusIndex,
    batchMode,
    setBatchMode,
    selectedSlideIds,
    cropTarget,
    setCropTarget,
    skipConfirm,
    setSkipConfirm,
    pptDragIndex,
    setPptDragIndex,
    pptDragOverIndex,
    setPptDragOverIndex,
    currentSlide,
    canUndo,
    canRedo,
    canSkip,
    canDuplicate,
    canMoveUp,
    canMoveDown,
    canEditImages,
    firstImageUrl,
    undo,
    redo,
    updateSlide,
    reorderSlideAt,
    addSlideAfter,
    requestSkipSlide,
    performSkipSlide,
    requestBatchSkip,
    performBatchSkip,
    toggleSlideSelect,
    selectAllSlides,
    clearSlideSelection,
    setSlideImageReplacement,
    openCrop,
    discardChanges,
    saveChanges,
  };
}
