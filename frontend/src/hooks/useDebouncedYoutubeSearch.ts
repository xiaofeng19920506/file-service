import { useCallback, useEffect, useRef, useState } from 'react';
import {
  searchYoutubeVideos,
  YOUTUBE_SEARCH_PAGE_SIZE,
  type YoutubeSearchResult,
} from '../api/youtube-search';
import { recordYoutubeSearch } from '../api/youtube-recommendations';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

export const YOUTUBE_SEARCH_DEBOUNCE_MS = 450;

type UseDebouncedYoutubeSearchOptions = {
  debounceMs?: number;
  debounceEnabled?: boolean;
};

function mergeSearchResults(
  prev: YoutubeSearchResult[],
  next: YoutubeSearchResult[],
): YoutubeSearchResult[] {
  const seen = new Set(prev.map((row) => row.videoId));
  const merged = [...prev];
  for (const row of next) {
    if (seen.has(row.videoId)) continue;
    seen.add(row.videoId);
    merged.push(row);
  }
  return merged;
}

export function useDebouncedYoutubeSearch(options: UseDebouncedYoutubeSearchOptions = {}) {
  const { debounceMs = YOUTUBE_SEARCH_DEBOUNCE_MS, debounceEnabled = true } = options;
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YoutubeSearchResult[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState(0);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeQueryRef = useRef('');

  const isSearchBusy = searchPending || searchLoading;

  const resetPagination = useCallback(() => {
    setHasMore(false);
    setNextPageToken(null);
    setNextOffset(0);
  }, []);

  const clearSearchState = useCallback(() => {
    requestIdRef.current += 1;
    activeQueryRef.current = '';
    setSearchResults([]);
    setSearchError(null);
    setSearchPending(false);
    setSearchLoading(false);
    setLoadMoreLoading(false);
    setHasSearched(false);
    resetPagination();
  }, [resetPagination]);

  const applySearchPage = useCallback(
    (
      data: {
        results: YoutubeSearchResult[];
        nextPageToken: string | null;
        hasMore: boolean;
        nextOffset: number;
      },
      mode: 'replace' | 'append',
    ) => {
      setSearchResults((prev) =>
        mode === 'replace' ? data.results : mergeSearchResults(prev, data.results),
      );
      setNextPageToken(data.nextPageToken);
      setNextOffset(data.nextOffset);
      setHasMore(data.hasMore);
      setHasSearched(true);
    },
    [],
  );

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        clearSearchState();
        return;
      }

      const id = ++requestIdRef.current;
      activeQueryRef.current = trimmed;
      setSearchPending(false);
      setSearchError(null);
      setSearchLoading(true);
      setLoadMoreLoading(false);
      setSearchResults([]);
      resetPagination();
      void recordYoutubeSearch(trimmed).catch(() => undefined);
      try {
        const data = await searchYoutubeVideos(trimmed, { limit: YOUTUBE_SEARCH_PAGE_SIZE });
        if (id !== requestIdRef.current) return;
        applySearchPage(data, 'replace');
      } catch (e) {
        if (id !== requestIdRef.current) return;
        setSearchError(friendlyError(e instanceof Error ? e.message : 'youtube_search_failed', t));
        setSearchResults([]);
        setHasSearched(true);
        resetPagination();
      } finally {
        if (id === requestIdRef.current) setSearchLoading(false);
      }
    },
    [applySearchPage, clearSearchState, resetPagination, t],
  );

  const loadMore = useCallback(async () => {
    const trimmed = activeQueryRef.current.trim();
    if (!trimmed || !hasMore || searchLoading || loadMoreLoading) return;

    const id = requestIdRef.current;
    setLoadMoreLoading(true);
    setSearchError(null);
    try {
      const data = await searchYoutubeVideos(trimmed, {
        limit: YOUTUBE_SEARCH_PAGE_SIZE,
        pageToken: nextPageToken ?? undefined,
        offset: nextPageToken ? undefined : nextOffset,
      });
      if (id !== requestIdRef.current) return;

      setSearchResults((prev) => mergeSearchResults(prev, data.results));
      setNextPageToken(data.nextPageToken);
      setNextOffset(data.nextOffset);
      setHasMore(data.hasMore && data.results.length > 0);
    } catch (e) {
      if (id !== requestIdRef.current) return;
      setSearchError(friendlyError(e instanceof Error ? e.message : 'youtube_search_failed', t));
    } finally {
      if (id === requestIdRef.current) setLoadMoreLoading(false);
    }
  }, [hasMore, loadMoreLoading, nextOffset, nextPageToken, searchLoading, t]);

  const searchNow = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSearchPending(false);
    void runSearch(searchQuery);
  }, [searchQuery, runSearch]);

  useEffect(() => {
    if (!debounceEnabled) {
      setSearchPending(false);
      if (!searchQuery.trim()) clearSearchState();
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      clearSearchState();
      return;
    }

    setSearchPending(true);
    debounceRef.current = setTimeout(() => {
      void runSearch(trimmed);
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, runSearch, debounceMs, debounceEnabled, clearSearchState]);

  const resetSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    requestIdRef.current += 1;
    setSearchQuery('');
    clearSearchState();
  }, [clearSearchState]);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchPending,
    searchLoading,
    loadMoreLoading,
    isSearchBusy,
    searchError,
    hasSearched,
    hasMore,
    searchNow,
    loadMore,
    resetSearch,
  };
}
