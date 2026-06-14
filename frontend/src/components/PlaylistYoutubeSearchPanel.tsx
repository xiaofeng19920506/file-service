import { useState } from 'react';
import { addPlaylistItemsByVideos, type PlaylistDetail } from '../api/playlists';
import { useDebouncedYoutubeSearch } from '../hooks/useDebouncedYoutubeSearch';
import { friendlyError } from '../lib/error-messages';
import { SearchIcon } from './icons';
import { useI18n } from '../i18n';

type PlaylistYoutubeSearchPanelProps = {
  playlistId: string;
  existingVideoIds: Set<string>;
  onAdded: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
  showHint?: boolean;
  className?: string;
};

export default function PlaylistYoutubeSearchPanel({
  playlistId,
  existingVideoIds,
  onAdded,
  showHint = false,
  className = '',
}: PlaylistYoutubeSearchPanelProps) {
  const { t } = useI18n();
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
  } = useDebouncedYoutubeSearch();

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
      <div className="search-box">
        <div className="search-input-wrap">
          <SearchIcon />
          <input
            type="search"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                searchNow();
              }
            }}
            placeholder={t('playlists.searchPlaceholder')}
            enterKeyHint="search"
            autoComplete="off"
            disabled={addingVideoId !== null}
          />
        </div>
        <button
          type="button"
          className="btn-secondary btn-search"
          onClick={searchNow}
          disabled={searchLoading || addingVideoId !== null}
        >
          {searchLoading ? t('search.searching') : t('search.button')}
        </button>
      </div>

      {showHint && (
        <p className="playlists-muted playlists-youtube-search-hint">{t('playlists.searchHint')}</p>
      )}

      {(searchError || addError) && (
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
              <li key={row.videoId} className="search-result-item search-result-card youtube-search-result">
                {row.thumbnailUrl && (
                  <img
                    className="youtube-search-thumb"
                    src={row.thumbnailUrl}
                    alt=""
                    loading="lazy"
                  />
                )}
                <div className="search-result-main">
                  <strong className="search-result-title">{row.title}</strong>
                  {row.channelTitle && (
                    <div className="search-result-meta">
                      <span className="meta-tag">{row.channelTitle}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`btn-secondary btn-add${inList ? ' added' : ''}`}
                  onClick={() => void handleAddSearchResult(row.videoId, row.title)}
                  disabled={inList || addingVideoId !== null}
                >
                  {inList
                    ? t('search.added')
                    : adding
                      ? t('playlists.adding')
                      : t('search.add')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
