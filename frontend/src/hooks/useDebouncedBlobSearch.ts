import { useCallback, useEffect, useRef, useState } from 'react';
import { searchBlobs } from '../api/client';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';
import type { BlobRecord } from '../types';

export const BLOB_SEARCH_DEBOUNCE_MS = 400;

export function useDebouncedBlobSearch(debounceMs = BLOB_SEARCH_DEBOUNCE_MS) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BlobRecord[]>([]);
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
        const results = await searchBlobs(trimmed);
        if (id !== requestIdRef.current) return;
        setSearchResults(results);
        setHasSearched(true);
      } catch (e) {
        if (id !== requestIdRef.current) return;
        setSearchError(friendlyError(e instanceof Error ? e.message : 'search_failed', t));
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

  const refreshSearch = useCallback(() => {
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
    setSearchError,
    hasSearched,
    searchNow,
    refreshSearch,
  };
}
