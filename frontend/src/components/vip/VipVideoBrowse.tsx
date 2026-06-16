import { useEffect, useRef, useState } from 'react';
import { fetchTrendingYoutubeSongs, type TrendingSong } from '../../api/youtube-trending';
import type { YoutubeSearchResult } from '../../api/youtube-search';
import { useDebouncedYoutubeSearch } from '../../hooks/useDebouncedYoutubeSearch';
import type { VipVideoTrack } from '../../hooks/useVipVideoPlayback';
import { friendlyError } from '../../lib/error-messages';
import { CloseIcon, SearchIcon } from '../icons';
import { useI18n } from '../../i18n';

type BrowseItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
};

export function toVipBrowseItem(row: YoutubeSearchResult | TrendingSong): BrowseItem {
  const thumbnailUrl =
    'thumbnailUrl' in row && row.thumbnailUrl
      ? row.thumbnailUrl
      : `https://i.ytimg.com/vi/${row.videoId}/mqdefault.jpg`;
  return {
    videoId: row.videoId,
    title: row.title,
    channelTitle: row.channelTitle,
    thumbnailUrl,
  };
}

export function VipVideoSearchBar({
  search,
  className = '',
}: {
  search: ReturnType<typeof useDebouncedYoutubeSearch>;
  className?: string;
}) {
  const { t } = useI18n();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    searchQuery,
    setSearchQuery,
    isSearchBusy,
    searchNow,
    resetSearch,
  } = search;

  const showClearSearch = searchQuery.trim().length > 0;

  const submitSearch = () => {
    if (searchQuery.trim()) searchNow();
  };

  return (
    <div className={`search-box vip-video-search-box${className ? ` ${className}` : ''}`}>
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
              submitSearch();
            }
          }}
          placeholder={t('vipVideo.searchPlaceholder')}
          enterKeyHint="search"
          autoComplete="off"
          aria-busy={isSearchBusy}
          aria-label={t('vipVideo.searchPlaceholder')}
        />
        {showClearSearch && !isSearchBusy && (
          <button
            type="button"
            className="search-clear-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              resetSearch();
              searchInputRef.current?.blur();
            }}
            aria-label={t('search.clear')}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <button
        type="button"
        className="btn-secondary btn-search"
        onClick={submitSearch}
        disabled={isSearchBusy}
      >
        {isSearchBusy ? t('search.searching') : t('search.button')}
      </button>
    </div>
  );
}

type VipVideoBrowseProps = {
  activeVideoId?: string | null;
  onPlay: (track: VipVideoTrack) => void;
  variant?: 'grid' | 'sidebar';
  className?: string;
  search: ReturnType<typeof useDebouncedYoutubeSearch>;
  showSearch?: boolean;
};

export default function VipVideoBrowse({
  activeVideoId = null,
  onPlay,
  variant = 'grid',
  className = '',
  search,
  showSearch = true,
}: VipVideoBrowseProps) {
  const { t } = useI18n();
  const resultsListRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [trending, setTrending] = useState<BrowseItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);

  const {
    searchQuery,
    searchResults,
    searchPending,
    searchLoading,
    loadMoreLoading,
    isSearchBusy,
    searchError,
    hasSearched,
    hasMore,
    loadMore,
  } = search;

  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    setTrendingError(null);
    void fetchTrendingYoutubeSongs(24)
      .then((data) => {
        if (cancelled) return;
        setTrending(data.songs.map(toVipBrowseItem));
      })
      .catch((e) => {
        if (cancelled) return;
        setTrending([]);
        setTrendingError(friendlyError(e instanceof Error ? e.message : 'load_trending_failed', t));
      })
      .finally(() => {
        if (!cancelled) setTrendingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

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

  const showTrending = searchResults.length === 0 && !isSearchBusy && !searchQuery.trim();
  const displayItems: BrowseItem[] = searchResults.length
    ? searchResults.map(toVipBrowseItem)
    : trending;

  const renderCard = (item: BrowseItem) => {
    const active = activeVideoId === item.videoId;
    return (
      <button
        key={item.videoId}
        type="button"
        className={`vip-video-card${active ? ' active' : ''}${variant === 'sidebar' ? ' vip-video-card--sidebar' : ''}`}
        onClick={() =>
          onPlay({
            videoId: item.videoId,
            title: item.title,
            channelTitle: item.channelTitle,
            thumbnailUrl: item.thumbnailUrl,
          })
        }
      >
        <span className="vip-video-card-thumb-wrap">
          <img
            className="vip-video-card-thumb"
            src={item.thumbnailUrl ?? `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
            alt=""
            loading="lazy"
          />
        </span>
        <span className="vip-video-card-meta">
          <strong className="vip-video-card-title" title={item.title}>
            {item.title}
          </strong>
          {item.channelTitle && (
            <span className="vip-video-card-channel" title={item.channelTitle}>
              {item.channelTitle}
            </span>
          )}
        </span>
      </button>
    );
  };

  if (variant === 'sidebar') {
    return (
      <div className={`vip-video-browse vip-video-browse--sidebar${className ? ` ${className}` : ''}`}>
        <h2 className="vip-video-browse-heading">{t('vipVideo.upNext')}</h2>
        <div className="vip-video-browse-list">{displayItems.map(renderCard)}</div>
      </div>
    );
  }

  return (
    <section className={`vip-video-browse${className ? ` ${className}` : ''}`} aria-label={t('vipVideo.browse')}>
      {showSearch && (
        <div className="vip-video-search-row">
          <VipVideoSearchBar search={search} />
        </div>
      )}

      {isSearchBusy && searchQuery.trim() && (
        <div className="youtube-search-loading-state" role="status" aria-live="polite">
          <span className="youtube-search-loading-spinner" aria-hidden />
          <span className="youtube-search-loading-label">
            {searchPending && !searchLoading ? t('search.preparing') : t('search.searching')}
          </span>
        </div>
      )}

      {(searchError || trendingError) && (
        <p className="error-msg vip-video-browse-error">{searchError ?? trendingError}</p>
      )}

      {!isSearchBusy && hasSearched && searchResults.length === 0 && !searchError && (
        <p className="search-empty">{t('playlists.searchNoResults')}</p>
      )}

      {showTrending && !trendingLoading && trending.length > 0 && (
        <h2 className="vip-video-browse-heading">{t('vipVideo.recommended')}</h2>
      )}

      {showTrending && trendingLoading && (
        <p className="vip-video-browse-muted">{t('vipVideo.loadingTrending')}</p>
      )}

      {displayItems.length > 0 && (
        <div ref={resultsListRef} className="vip-video-browse-grid">
          {displayItems.map(renderCard)}
          {(hasMore || loadMoreLoading) && searchResults.length > 0 && (
            <div ref={loadMoreRef} className="vip-video-browse-load-more" aria-hidden={!loadMoreLoading}>
              {loadMoreLoading && (
                <>
                  <span className="youtube-search-load-more-spinner" aria-hidden />
                  <span className="youtube-search-load-more-label">{t('search.loadingMore')}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
