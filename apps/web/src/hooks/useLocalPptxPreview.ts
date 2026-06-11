import { useEffect, useState } from 'react';
import { parsePptxSlidesDetailed, type EditableSlide } from '../lib/pptx-preview';

export function useLocalPptxPreview(file: File | null, sourceId: string) {
  const [slides, setSlides] = useState<EditableSlide[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setSlides([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSlides([]);

    void (async () => {
      try {
        const parsed = await parsePptxSlidesDetailed(file, {
          sourceFile: file.name,
          sourceItemId: sourceId,
        });
        if (!cancelled) setSlides(parsed);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'preview_failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, sourceId]);

  return { slides, loading, error };
}
