import { useEffect, useRef, useState } from 'react';
import { fetchTrendingYoutubeSongs, type TrendingSong } from '../../api/youtube-trending';
import type { YoutubeSearchResult, YoutubeVideoCacheStatus } from '../../api/youtube-search';
import { fetchYoutubeVideoStatuses } from '../../api/vip-video';
import { useDebouncedYoutubeSearch } from '../../hooks/useDebouncedYoutubeSearch';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import type { VipVideoTrack } from '../../hooks/useVipVideoPlayback';
import { friendlyError } from '../../lib/error-messages';
import { resolveYoutubeThumbnailUrl } from '../../lib/youtube-thumbnail';
import { CloseIcon, SearchIcon } from '../icons';
import { useI18n } from '../../i18n';

type BrowseItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  videoStatus?: YoutubeVideoCacheStatus | null;
};

export function toVipBrowseItem(row: YoutubeSearchResult | TrendingSong): BrowseItem {
  const thumbnailUrl = resolveYoutubeThumbnailUrl(
    row.videoId,
    'thumbnailUrl' in row ? row.thumbnailUrl : null,
  );
  return {
    videoId: row.videoId,
    title: row.title,
    channelTitle: row.channelTitle,
    thumbnailUrl,
    videoStatus: row.video?.status ?? null,
  };
}

export function VipVideoSearchBar({
  search,
  className = '',
  isMobile = false,
}: {
  search: ReturnType<typeof useDebouncedYoutubeSearch>;
  className?: string;
  isMobile?: boolean;
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
    <div
      className={`search-box vip-video-search-box${isMobile ? ' search-box--submit-only' : ''}${className ? ` ${className}` : ''}`}
    >
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
              if (isMobile) {
                e.currentTarget.blur();
                return;
              }
              submitSearch();
            }
          }}
          onBlur={() => {
            if (isMobile) submitSearch();
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
      {!isMobile && (
        <button
          type="button"
          className="btn-secondary btn-search"
          onClick={submitSearch}
          disabled={isSearchBusy}
        >
          {isSearchBusy ? t('search.searching') : t('search.button')}
        </button>
      )}
    </div>
  );
}

type VipVideoBrowseProps = {
  activeVideoId?: string | null;
  onPlay: (track: VipVideoTrack) => void;
  variant?: 'grid' | 'sidebar';
  listStyle?: 'grid' | 'row';
  className?: string;
  search: ReturnType<typeof useDebouncedYoutubeSearch>;
  showSearch?: boolean;
  isMobile?: boolean;
};

export default function VipVideoBrowse({
  activeVideoId = null,
  onPlay,
  variant = 'grid',
  listStyle = 'grid',
  className = '',
  search,
  showSearch = true,
  isMobile: isMobileProp,
}: VipVideoBrowseProps) {
  const { t } = useI18n();
  const isMobileHook = useMediaQuery(MOBILE_MEDIA_QUERY);
  const isMobile = isMobileProp ?? isMobileHook;
  const resultsListRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [trending, setTrending] = useState<BrowseItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [videoStatusById, setVideoStatusById] = useState<
    Record<string, YoutubeVideoCacheStatus>
  >({});

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

  const effectiveListStyle = variant === 'sidebar' ? 'row' : listStyle;

  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    setTrendingError(null);
    void fetchTrendingYoutubeSongs(isMobile ? 20 : 24)
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
  }, [isMobile, t]);

  useEffect(() => {
    const root = resultsListRef.current;
    const target = loadMoreRef.current;
    if (!target || !hasMore || isSearchBusy || loadMoreLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      {
        root: isMobile ? null : root,
        rootMargin: '160px',
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isSearchBusy, isMobile, loadMore, loadMoreLoading, searchResults.length]);

  const showTrending = searchResults.length === 0 && !isSearchBusy && !searchQuery.trim();
  const displayItems: BrowseItem[] = searchResults.length
    ? searchResults.map(toVipBrowseItem)
    : trending;

  useEffect(() => {
    const fromResults: Record<string, YoutubeVideoCacheStatus> = {};
    for (const row of searchResults) {
      if (row.video?.status) fromResults[row.videoId] = row.video.status;
    }
    if (Object.keys(fromResults).length) {
      setVideoStatusById((prev) => ({ ...prev, ...fromResults }));
    }
  }, [searchResults]);

  useEffect(() => {
    const cachingIds = displayItems
      .map((item) => item.videoId)
      .filter((id) => {
        const status = videoStatusById[id] ?? displayItems.find((i) => i.videoId === id)?.videoStatus;
        return status === 'pending' || status === 'processing';
      });
    if (!cachingIds.length) return;

    const refresh = () => {
      void fetchYoutubeVideoStatuses(cachingIds).then((items) => {
        if (!items.length) return;
        setVideoStatusById((prev) => {
          const next = { ...prev };
          for (const row of items) next[row.videoId] = row.status;
          return next;
        });
      });
    };

    void refresh();
    const timer = window.setInterval(refresh, 6000);
    return () => window.clearInterval(timer);
  }, [displayItems, videoStatusById]);

  const statusLabel = (status: YoutubeVideoCacheStatus | null | undefined) => {
    if (status === 'ready') return t('vipVideo.statusReady');
    if (status === 'failed') return t('vipVideo.statusFailed');
    if (status === 'pending' || status === 'processing') return t('vipVideo.statusCaching');
    return null;
  };

  const renderCard = (item: BrowseItem) => {
    const active = activeVideoId === item.videoId;
    const rowLayout = effectiveListStyle === 'row';
    const cacheStatus = videoStatusById[item.videoId] ?? item.videoStatus;
    const cacheLabel = statusLabel(cacheStatus);
    return (
      <button
        key={item.videoId}
        type="button"
        className={`vip-video-card${active ? ' active' : ''}${rowLayout ? ' vip-video-card--row' : ''}${variant === 'sidebar' ? ' vip-video-card--sidebar' : ''}`}
        onClick={() =>
          onPlay({
            videoId: item.videoId,
            title: item.title,
            channelTitle: item.channelTitle,
            thumbnailUrl: item.thumbnailUrl,
            cacheStatus: cacheStatus ?? null,
          })
        }
      >
        <span className="vip-video-card-thumb-wrap">
          <img
            className="vip-video-card-thumb"
            src={item.thumbnailUrl ?? resolveYoutubeThumbnailUrl(item.videoId)}
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
          {cacheLabel && (
            <span
              className={`vip-video-card-status${cacheStatus === 'ready' ? ' ready' : ''}${cacheStatus === 'failed' ? ' failed' : ''}`}
            >
              {cacheLabel}
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
    <section
      className={`vip-video-browse${isMobile ? ' vip-video-browse--mobile' : ''}${effectiveListStyle === 'row' ? ' vip-video-browse--row' : ''}${className ? ` ${className}` : ''}`}
      aria-label={t('vipVideo.browse')}
    >
      {showSearch && (
        <div className="vip-video-search-row">
          <VipVideoSearchBar search={search} isMobile={isMobile} />
        </div>
      )}

      {isSearchBusy && searchQuery.trim() && (
        <div
          className={`youtube-search-loading-state${isMobile ? ' youtube-search-loading-state--mobile-home' : ''}`}
          role="status"
          aria-live="polite"
        >
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

      {showTrending && !trendingLoading && trending.length > 0 && effectiveListStyle !== 'row' && (
        <h2 className="vip-video-browse-heading">{t('vipVideo.recommended')}</h2>
      )}

      {showTrending && trendingLoading && (
        <p className="vip-video-browse-muted">{t('vipVideo.loadingTrending')}</p>
      )}

      {displayItems.length > 0 && (
        <div
          ref={resultsListRef}
          className={`vip-video-browse-grid${effectiveListStyle === 'row' ? ' vip-video-browse-grid--row' : ''}`}
        >
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
