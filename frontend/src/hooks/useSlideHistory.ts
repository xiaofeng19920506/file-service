import { useCallback, useState } from 'react';
import { reindexSlides, type EditableSlide } from '../lib/pptx-preview';
import { cloneSlides, SLIDE_HISTORY_MAX } from '../lib/slide-history';

export function useSlideHistory() {
  const [slides, setSlidesState] = useState<EditableSlide[]>([]);
  const [undoStack, setUndoStack] = useState<EditableSlide[][]>([]);
  const [redoStack, setRedoStack] = useState<EditableSlide[][]>([]);

  const resetHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const replaceSlides = useCallback(
    (next: EditableSlide[]) => {
      resetHistory();
      setSlidesState(next);
    },
    [resetHistory],
  );

  const pushUndo = useCallback((snapshot: EditableSlide[]) => {
    setUndoStack((stack) => {
      const next = [...stack, cloneSlides(snapshot)];
      return next.length > SLIDE_HISTORY_MAX ? next.slice(-SLIDE_HISTORY_MAX) : next;
    });
    setRedoStack([]);
  }, []);

  const updateSlides = useCallback(
    (updater: (prev: EditableSlide[]) => EditableSlide[]) => {
      setSlidesState((prev) => {
        pushUndo(prev);
        return reindexSlides(updater(prev));
      });
    },
    [pushUndo],
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const prev = stack[stack.length - 1];
      setSlidesState((current) => {
        setRedoStack((redo) => [...redo, cloneSlides(current)]);
        return prev;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setSlidesState((current) => {
        setUndoStack((undo) => [...undo, cloneSlides(current)]);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  return {
    slides,
    replaceSlides,
    updateSlides,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    resetHistory,
  };
}
