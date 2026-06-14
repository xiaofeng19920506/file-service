import { useEffect, useRef, useState } from 'react';
import {
  addPlaylistItemsByVideos,
  type PlaylistDetail,
  type PlaylistSummary,
} from '../api/playlists';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useDebouncedYoutubeSearch } from '../hooks/useDebouncedYoutubeSearch';
import { friendlyError } from '../lib/error-messages';
import PickPlaylistForAddModal from './PickPlaylistForAddModal';
import YoutubeTrendingSongs from './YoutubeTrendingSongs';
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from './icons';
import { useI18n } from '../i18n';

type PendingAdd = { videoId: string; title: string };

type PlaylistYoutubeSearchPanelProps = {
  playlistId?: string;
  existingVideoIds?: Set<string>;
  libraryVideoIds?: Set<string>;
  onAdded: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
  showHint?: boolean;
  mobileListOnly?: boolean;
  pickPlaylistOnAdd?: boolean;
  playlists?: PlaylistSummary[];
  loadingPlaylists?: boolean;
  onCreatePlaylist?: (title: string) => Promise<PlaylistDetail>;
  onPreviewTrack?: (track: { videoId: string; title: string }) => void;
  className?: string;
};

export default function PlaylistYoutubeSearchPanel({
  playlistId,
  existingVideoIds = new Set(),
  libraryVideoIds = new Set(),
  onAdded,
  showHint = false,
  mobileListOnly = false,
  pickPlaylistOnAdd = false,
  playlists = [],
  loadingPlaylists = false,
  onCreatePlaylist,
  onPreviewTrack,
  className = '',
}: PlaylistYoutubeSearchPanelProps) {
  const { t } = useI18n();
  const isMobileViewport = useMediaQuery(MOBILE_MEDIA_QUERY);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  const {
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
  } = useDebouncedYoutubeSearch({ debounceEnabled: !isMobileViewport });

  const resultsListRef = useRef<HTMLUListElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = resultsListRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasMore || isSearchBusy || loadMoreLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: '120px', threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isSearchBusy, loadMore, loadMoreLoading, searchResults.length]);

  const submitSearch = () => {
    if (searchQuery.trim()) searchNow();
  };

  const showClearSearch = searchQuery.trim().length > 0;

  const handleClearSearch = () => {
    resetSearch();
    setAddError(null);
    searchInputRef.current?.blur();
  };

  const addToPlaylist = async (targetPlaylistId: string, videoId: string, title: string) => {
    setAddingVideoId(videoId);
    setAddError(null);
    try {
      const data = await addPlaylistItemsByVideos(targetPlaylistId, [{ videoId, title }]);
      onAdded(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
      setPendingAdd(null);
    } catch (err) {
      const message = friendlyError(
        err instanceof Error ? err.message : 'add_playlist_item_failed',
        t,
      );
      if (pickPlaylistOnAdd) {
        throw err instanceof Error ? err : new Error(message);
      }
      setAddError(message);
    } finally {
      setAddingVideoId(null);
    }
  };

  const handleAddSearchResult = async (videoId: string, title: string) => {
    if (addingVideoId) return;

    if (pickPlaylistOnAdd) {
      if (!onCreatePlaylist) return;
      setPendingAdd({ videoId, title });
      return;
    }

    if (!playlistId || isInCurrentPlaylist(videoId)) return;
    await addToPlaylist(playlistId, videoId, title);
  };

  const isInCurrentPlaylist = (videoId: string) => existingVideoIds.has(videoId);

  const isInAnyPlaylist = (videoId: string, inLibrary?: boolean) =>
    inLibrary === true || libraryVideoIds.has(videoId);

  const showTrending = searchResults.length === 0 && !isSearchBusy && !searchQuery.trim();

  return (
    <>
      <section
        className={`playlists-youtube-search${className ? ` ${className}` : ''}`}
        aria-label={t('playlists.searchSection')}
        aria-busy={isSearchBusy || loadMoreLoading}
      >
        <div className={`search-box${isMobileViewport ? ' search-box--submit-only' : ''}`}>
          <div className={`search-input-wrap${isSearchBusy ? ' search-input-wrap--busy' : ''}`}>
            {isSearchBusy ? (
              <span className="search-input-spinner" aria-hidden />
            ) : (
              <SearchIcon />
            )}
            <input
              ref={searchInputRef}
              type="search"
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (isMobileViewport) {
                    e.currentTarget.blur();
                    return;
                  }
                  submitSearch();
                }
              }}
              onBlur={() => {
                if (isMobileViewport) submitSearch();
              }}
              placeholder={t('playlists.searchPlaceholder')}
              enterKeyHint="search"
              autoComplete="off"
              disabled={addingVideoId !== null}
              aria-busy={isSearchBusy}
            />
            {showClearSearch && !isSearchBusy && (
              <button
                type="button"
                className="search-clear-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClearSearch}
                aria-label={t('search.clear')}
                disabled={addingVideoId !== null}
              >
                <CloseIcon />
              </button>
            )}
          </div>
          {!isMobileViewport && (
            <button
              type="button"
              className="btn-secondary btn-search"
              onClick={submitSearch}
              disabled={isSearchBusy || addingVideoId !== null}
            >
              {isSearchBusy ? t('search.searching') : t('search.button')}
            </button>
          )}
        </div>

        {isSearchBusy && searchQuery.trim() && (
          <div
            className={`youtube-search-loading-state${mobileListOnly ? ' youtube-search-loading-state--mobile-home' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="youtube-search-loading-spinner" aria-hidden />
            <span className="youtube-search-loading-label">
              {searchPending && !searchLoading ? t('search.preparing') : t('search.searching')}
            </span>
          </div>
        )}

        {showTrending && (
          <YoutubeTrendingSongs
            className={mobileListOnly ? 'youtube-trending--mobile-home' : ''}
            pickPlaylistOnAdd={pickPlaylistOnAdd}
            playlistId={playlistId}
            libraryVideoIds={libraryVideoIds}
            existingVideoIds={existingVideoIds}
            playlists={playlists}
            loadingPlaylists={loadingPlaylists}
            onCreatePlaylist={onCreatePlaylist}
            onAdded={onAdded}
            onPreviewTrack={onPreviewTrack}
          />
        )}

        {showHint && !mobileListOnly && (
          <p className="playlists-muted playlists-youtube-search-hint">{t('playlists.searchHint')}</p>
        )}

        {!mobileListOnly && (searchError || addError) && (
          <p className="error-msg playlists-youtube-search-error">{searchError ?? addError}</p>
        )}

        {!isSearchBusy && hasSearched && searchResults.length === 0 && !searchError && (
          <p className="search-empty">{t('playlists.searchNoResults')}</p>
        )}

        {searchResults.length > 0 && (
          <ul
            ref={resultsListRef}
            className="search-results youtube-search-results playlists-youtube-search-results"
          >
            {searchResults.map((row) => {
              const inCurrentPlaylist = !pickPlaylistOnAdd && isInCurrentPlaylist(row.videoId);
              const alreadyAdded = pickPlaylistOnAdd && isInAnyPlaylist(row.videoId, row.inLibrary);
              const adding = addingVideoId === row.videoId;
              return (
                <li key={row.videoId} className="search-result-item youtube-search-result">
                  {onPreviewTrack ? (
                    <button
                      type="button"
                      className="youtube-search-result-play"
                      onClick={() => onPreviewTrack({ videoId: row.videoId, title: row.title })}
                      disabled={addingVideoId !== null}
                    >
                      <div className="search-result-main">
                        <strong className="search-result-title" title={row.title}>
                          {row.title}
                        </strong>
                        {row.channelTitle && (
                          <p className="search-result-channel" title={row.channelTitle}>
                            {row.channelTitle}
                          </p>
                        )}
                      </div>
                    </button>
                  ) : (
                    <div className="search-result-main">
                      <strong className="search-result-title" title={row.title}>
                        {row.title}
                      </strong>
                      {row.channelTitle && (
                        <p className="search-result-channel" title={row.channelTitle}>
                          {row.channelTitle}
                        </p>
                      )}
                    </div>
                  )}
                  {inCurrentPlaylist ? (
                    <button
                      type="button"
                      className={`youtube-search-add-btn added${adding ? ' loading' : ''}`}
                      disabled
                      aria-label={t('search.added')}
                      title={t('search.added')}
                    >
                      <CheckIcon />
                    </button>
                  ) : alreadyAdded ? (
                    <button
                      type="button"
                      className={`youtube-search-added-btn${adding ? ' loading' : ''}`}
                      onClick={() => void handleAddSearchResult(row.videoId, row.title)}
                      disabled={addingVideoId !== null}
                      aria-label={adding ? t('playlists.adding') : t('search.alreadyAdded')}
                      title={adding ? t('playlists.adding') : t('search.alreadyAdded')}
                    >
                      {adding ? (
                        <span className="youtube-search-add-spinner" aria-hidden />
                      ) : (
                        t('search.alreadyAdded')
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`youtube-search-add-btn${adding ? ' loading' : ''}`}
                      onClick={() => void handleAddSearchResult(row.videoId, row.title)}
                      disabled={addingVideoId !== null}
                      aria-label={adding ? t('playlists.adding') : t('search.add')}
                      title={adding ? t('playlists.adding') : t('search.add')}
                    >
                      {adding ? (
                        <span className="youtube-search-add-spinner" aria-hidden />
                      ) : (
                        <PlusIcon />
                      )}
                    </button>
                  )}
                </li>
              );
            })}
            {(hasMore || loadMoreLoading) && (
              <li className="youtube-search-load-more" aria-hidden={!loadMoreLoading}>
                <div ref={loadMoreRef} className="youtube-search-load-more-sentinel">
                  {loadMoreLoading && (
                    <>
                      <span className="youtube-search-load-more-spinner" aria-hidden />
                      <span className="youtube-search-load-more-label">{t('search.loadingMore')}</span>
                    </>
                  )}
                </div>
              </li>
            )}
          </ul>
        )}
      </section>

      {pendingAdd && onCreatePlaylist && (
        <PickPlaylistForAddModal
          videoTitle={pendingAdd.title}
          playlists={playlists}
          loadingPlaylists={loadingPlaylists}
          busy={addingVideoId === pendingAdd.videoId}
          onClose={() => {
            if (addingVideoId) return;
            setPendingAdd(null);
          }}
          onPick={(targetId) => addToPlaylist(targetId, pendingAdd.videoId, pendingAdd.title)}
          onCreatePlaylist={onCreatePlaylist}
        />
      )}
    </>
  );
}
