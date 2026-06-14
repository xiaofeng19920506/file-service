import { useRef, useState } from 'react';
import { addPlaylistItemsByVideos, type PlaylistDetail } from '../api/playlists';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useDebouncedYoutubeSearch } from '../hooks/useDebouncedYoutubeSearch';
import { friendlyError } from '../lib/error-messages';
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from './icons';
import { useI18n } from '../i18n';

type PlaylistYoutubeSearchPanelProps = {
  playlistId: string;
  existingVideoIds: Set<string>;
  onAdded: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
  showHint?: boolean;
  mobileListOnly?: boolean;
  className?: string;
};

export default function PlaylistYoutubeSearchPanel({
  playlistId,
  existingVideoIds,
  onAdded,
  showHint = false,
  mobileListOnly = false,
  className = '',
}: PlaylistYoutubeSearchPanelProps) {
  const { t } = useI18n();
  const isMobileViewport = useMediaQuery(MOBILE_MEDIA_QUERY);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    searchError,
    hasSearched,
    searchNow,
    resetSearch,
  } = useDebouncedYoutubeSearch({ debounceEnabled: !isMobileViewport });

  const submitSearch = () => {
    if (searchQuery.trim()) searchNow();
  };

  const showClearSearch =
    Boolean(searchQuery.trim()) || searchLoading || hasSearched || searchResults.length > 0;

  const handleClearSearch = () => {
    resetSearch();
    setAddError(null);
    searchInputRef.current?.blur();
  };

  const handleAddSearchResult = async (videoId: string, title: string) => {
    if (addingVideoId || existingVideoIds.has(videoId)) return;

    setAddingVideoId(videoId);
    setAddError(null);
    try {
      const data = await addPlaylistItemsByVideos(playlistId, [{ videoId, title }]);
      onAdded(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
    } catch (err) {
      setAddError(friendlyError(err instanceof Error ? err.message : 'add_playlist_item_failed', t));
    } finally {
      setAddingVideoId(null);
    }
  };

  return (
    <section
      className={`playlists-youtube-search${className ? ` ${className}` : ''}`}
      aria-label={t('playlists.searchSection')}
    >
      <div className={`search-box${isMobileViewport ? ' search-box--submit-only' : ''}`}>
        <div className="search-input-wrap">
          <SearchIcon />
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
          />
          {showClearSearch && (
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
            disabled={searchLoading || addingVideoId !== null}
          >
            {searchLoading ? t('search.searching') : t('search.button')}
          </button>
        )}
      </div>

      {isMobileViewport && searchLoading && !mobileListOnly && (
        <p className="playlists-muted playlists-youtube-search-loading">{t('search.searching')}</p>
      )}

      {showHint && !mobileListOnly && (
        <p className="playlists-muted playlists-youtube-search-hint">{t('playlists.searchHint')}</p>
      )}

      {!mobileListOnly && (searchError || addError) && (
        <p className="error-msg playlists-youtube-search-error">{searchError ?? addError}</p>
      )}

      {!searchLoading && hasSearched && searchResults.length === 0 && !searchError && (
        <p className="search-empty">{t('playlists.searchNoResults')}</p>
      )}

      {searchResults.length > 0 && (
        <ul className="search-results youtube-search-results playlists-youtube-search-results">
          {searchResults.map((row) => {
            const inList = existingVideoIds.has(row.videoId);
            const adding = addingVideoId === row.videoId;
            return (
              <li key={row.videoId} className="search-result-item youtube-search-result">
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
                <button
                  type="button"
                  className={`youtube-search-add-btn${inList ? ' added' : ''}${adding ? ' loading' : ''}`}
                  onClick={() => void handleAddSearchResult(row.videoId, row.title)}
                  disabled={inList || addingVideoId !== null}
                  aria-label={
                    inList
                      ? t('search.added')
                      : adding
                        ? t('playlists.adding')
                        : t('search.add')
                  }
                  title={
                    inList
                      ? t('search.added')
                      : adding
                        ? t('playlists.adding')
                        : t('search.add')
                  }
                >
                  {inList ? <CheckIcon /> : adding ? <span className="youtube-search-add-spinner" aria-hidden /> : <PlusIcon />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
