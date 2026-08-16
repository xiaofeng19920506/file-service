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

type YoutubeSearchSnapshot = {
  query: string;
  results: YoutubeSearchResult[];
  hasSearched: boolean;
  hasMore: boolean;
  nextPageToken: string | null;
  nextOffset: number;
  error: string | null;
};

const searchSnapshots = new Map<string, YoutubeSearchSnapshot>();

type UseDebouncedYoutubeSearchOptions = {
  debounceMs?: number;
  debounceEnabled?: boolean;
  persistKey?: string;
};

export type DebouncedYoutubeSearch = ReturnType<typeof useDebouncedYoutubeSearch>;

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
  const {
    debounceMs = YOUTUBE_SEARCH_DEBOUNCE_MS,
    debounceEnabled = true,
    persistKey,
  } = options;
  const { t } = useI18n();
  const snapshot = persistKey ? searchSnapshots.get(persistKey) : undefined;
  const [searchQuery, setSearchQuery] = useState(snapshot?.query ?? '');
  const [searchResults, setSearchResults] = useState<YoutubeSearchResult[]>(
    () => snapshot?.results ?? [],
  );
  const [searchPending, setSearchPending] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(snapshot?.error ?? null);
  const [hasSearched, setHasSearched] = useState(snapshot?.hasSearched ?? false);
  const [hasMore, setHasMore] = useState(snapshot?.hasMore ?? false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(
    snapshot?.nextPageToken ?? null,
  );
  const [nextOffset, setNextOffset] = useState(snapshot?.nextOffset ?? 0);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeQueryRef = useRef(snapshot?.query.trim() ?? '');

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

      const sameQuery = activeQueryRef.current === trimmed;
      const id = ++requestIdRef.current;
      activeQueryRef.current = trimmed;
      setSearchPending(false);
      setSearchError(null);
      setSearchLoading(true);
      setLoadMoreLoading(false);
      if (!sameQuery) {
        setSearchResults([]);
        resetPagination();
      }
      void recordYoutubeSearch(trimmed).catch(() => undefined);
      try {
        const data = await searchYoutubeVideos(trimmed, {
          limit: YOUTUBE_SEARCH_PAGE_SIZE,
        });
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
    if (searchResults.length >= 500) {
      setHasMore(false);
      return;
    }

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

      setSearchResults((prev) => {
        const merged = mergeSearchResults(prev, data.results);
        setHasMore(data.hasMore && data.results.length > 0 && merged.length < 500);
        return merged;
      });
      setNextPageToken(data.nextPageToken);
      setNextOffset(data.nextOffset);
    } catch (e) {
      if (id !== requestIdRef.current) return;
      setSearchError(friendlyError(e instanceof Error ? e.message : 'youtube_search_failed', t));
    } finally {
      if (id === requestIdRef.current) setLoadMoreLoading(false);
    }
  }, [hasMore, loadMoreLoading, nextOffset, nextPageToken, searchLoading, searchResults.length, t]);

  useEffect(() => {
    if (searchError) return;
    if (!hasMore || searchLoading || loadMoreLoading || searchResults.length === 0) return;
    if (searchResults.length >= 500) return;
    void loadMore();
  }, [hasMore, loadMoreLoading, loadMore, searchError, searchLoading, searchResults.length]);

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
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchPending(false);
      return;
    }

    setSearchPending(true);
    debounceRef.current = setTimeout(() => {
      void runSearch(trimmed);
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, runSearch, debounceMs, debounceEnabled]);

  useEffect(() => {
    if (!persistKey) return;
    searchSnapshots.set(persistKey, {
      query: searchQuery,
      results: searchResults,
      hasSearched,
      hasMore,
      nextPageToken,
      nextOffset,
      error: searchError,
    });
  }, [
    persistKey,
    searchQuery,
    searchResults,
    hasSearched,
    hasMore,
    nextPageToken,
    nextOffset,
    searchError,
  ]);

  const resetSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    requestIdRef.current += 1;
    setSearchQuery('');
    clearSearchState();
    if (persistKey) searchSnapshots.delete(persistKey);
  }, [clearSearchState, persistKey]);

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
