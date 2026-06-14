import { useCallback, useEffect, useRef, useState } from 'react';
import { searchYoutubeVideos, type YoutubeSearchResult } from '../api/youtube-search';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

export const YOUTUBE_SEARCH_DEBOUNCE_MS = 450;

export function useDebouncedYoutubeSearch(debounceMs = YOUTUBE_SEARCH_DEBOUNCE_MS) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YoutubeSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSearchState = useCallback(() => {
    requestIdRef.current += 1;
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(false);
    setHasSearched(false);
  }, []);

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        clearSearchState();
        return;
      }

      const id = ++requestIdRef.current;
      setSearchError(null);
      setSearchLoading(true);
      try {
        const data = await searchYoutubeVideos(trimmed);
        if (id !== requestIdRef.current) return;
        setSearchResults(data.results);
        setHasSearched(true);
      } catch (e) {
        if (id !== requestIdRef.current) return;
        setSearchError(friendlyError(e instanceof Error ? e.message : 'youtube_search_failed', t));
        setSearchResults([]);
        setHasSearched(true);
      } finally {
        if (id === requestIdRef.current) setSearchLoading(false);
      }
    },
    [clearSearchState, t],
  );

  const searchNow = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void runSearch(searchQuery);
  }, [searchQuery, runSearch]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      clearSearchState();
      return;
    }

    debounceRef.current = setTimeout(() => {
      void runSearch(trimmed);
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, runSearch, debounceMs, clearSearchState]);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    hasSearched,
    searchNow,
  };
}
