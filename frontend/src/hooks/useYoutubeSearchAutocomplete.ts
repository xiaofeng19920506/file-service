import { useEffect, useRef, useState } from 'react';
import { fetchYoutubeSearchSuggestions } from '../api/youtube-search';

export const YOUTUBE_SEARCH_AUTOCOMPLETE_DEBOUNCE_MS = 450;

export function useYoutubeSearchAutocomplete(query: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      setSuggestLoading(false);
      setSuggestionsOpen(false);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setSuggestLoading(false);
      setSuggestionsOpen(false);
      return;
    }

    setSuggestLoading(true);
    const timer = window.setTimeout(() => {
      const id = ++requestIdRef.current;
      void fetchYoutubeSearchSuggestions(trimmed)
        .then((items) => {
          if (id !== requestIdRef.current) return;
          setSuggestions(items);
          setSuggestionsOpen(items.length > 0);
        })
        .catch(() => {
          if (id !== requestIdRef.current) return;
          setSuggestions([]);
          setSuggestionsOpen(false);
        })
        .finally(() => {
          if (id === requestIdRef.current) setSuggestLoading(false);
        });
    }, YOUTUBE_SEARCH_AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  const closeSuggestions = () => {
    setSuggestionsOpen(false);
  };

  return {
    suggestions,
    suggestLoading,
    suggestionsOpen,
    closeSuggestions,
    setSuggestionsOpen,
  };
}
