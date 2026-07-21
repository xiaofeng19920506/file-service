import { useEffect, useState } from 'react';
import { addBulletinWorshipPlaylistItemsByVideos } from '../api/bulletins';
import {
  addPlaylistItemsByVideos,
  type PlaylistDetail,
  type PlaylistSummary,
} from '../api/playlists';
import {
  fetchTrendingYoutubeSongs,
  type TrendingScope,
  type TrendingSong,
} from '../api/youtube-trending';
import { friendlyError } from '../lib/error-messages';
import { resolveYoutubeThumbnailUrl } from '../lib/youtube-thumbnail';
import PickPlaylistForAddModal from './PickPlaylistForAddModal';
import { CheckIcon, PlusIcon } from './icons';
import { useI18n } from '../i18n';
import type { YoutubeSearchResultLayout } from './PlaylistYoutubeSearchPanel';

type PendingAdd = { videoId: string; title: string };

type YoutubeTrendingSongsProps = {
  libraryVideoIds?: Set<string>;
  existingVideoIds?: Set<string>;
  pickPlaylistOnAdd?: boolean;
  playlistId?: string;
  bulletinId?: string;
  playlists?: PlaylistSummary[];
  loadingPlaylists?: boolean;
  onCreatePlaylist?: (title: string) => Promise<PlaylistDetail>;
  onAdded: (detail: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => void;
  onPreviewTrack?: (track: { videoId: string; title: string }) => void;
  className?: string;
  resultLayout?: YoutubeSearchResultLayout;
};

export default function YoutubeTrendingSongs({
  libraryVideoIds = new Set(),
  existingVideoIds = new Set(),
  pickPlaylistOnAdd = false,
  playlistId,
  bulletinId,
  playlists = [],
  loadingPlaylists = false,
  onCreatePlaylist,
  onAdded,
  onPreviewTrack,
  className = '',
  resultLayout = 'list',
}: YoutubeTrendingSongsProps) {
  const { t } = useI18n();
  const [songs, setSongs] = useState<TrendingSong[]>([]);
  const [scope, setScope] = useState<TrendingScope>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchTrendingYoutubeSongs(10)
      .then((data) => {
        if (cancelled) return;
        setSongs(data.songs);
        setScope(data.scope);
      })
      .catch((e) => {
        if (cancelled) return;
        setSongs([]);
        setError(friendlyError(e instanceof Error ? e.message : 'load_trending_failed', t));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const isInCurrentPlaylist = (videoId: string) => existingVideoIds.has(videoId);
  const isInAnyPlaylist = (videoId: string, inLibrary?: boolean) =>
    inLibrary === true || libraryVideoIds.has(videoId);

  const addToPlaylist = async (targetPlaylistId: string, videoId: string, title: string) => {
    setAddingVideoId(videoId);
    try {
      const data = bulletinId
        ? await addBulletinWorshipPlaylistItemsByVideos(bulletinId, [{ videoId, title }])
        : await addPlaylistItemsByVideos(targetPlaylistId, [{ videoId, title }]);
      onAdded(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
      setSongs((prev) =>
        prev.map((song) =>
          song.videoId === videoId ? { ...song, inLibrary: true } : song,
        ),
      );
      setPendingAdd(null);
    } catch (err) {
      if (pickPlaylistOnAdd) {
        throw err instanceof Error ? err : new Error('add_playlist_item_failed');
      }
    } finally {
      setAddingVideoId(null);
    }
  };

  const handleAdd = async (videoId: string, title: string) => {
    if (addingVideoId) return;
    if (pickPlaylistOnAdd) {
      if (!onCreatePlaylist) return;
      setPendingAdd({ videoId, title });
      return;
    }
    if ((!playlistId && !bulletinId) || isInCurrentPlaylist(videoId)) return;
    await addToPlaylist(playlistId ?? '', videoId, title);
  };

  const scopeLabel =
    scope === 'today'
      ? t('playlists.trendingToday')
      : scope === 'all_time'
        ? t('playlists.trendingAllTime')
        : t('playlists.trendingPopular');

  if (loading) {
    return (
      <section
        className={`youtube-trending${className ? ` ${className}` : ''}`}
        role="status"
        aria-live="polite"
      >
        <div className="youtube-trending-loading">
          <span className="youtube-search-loading-spinner" aria-hidden />
          <span className="youtube-trending-loading-label">{t('playlists.trendingLoading')}</span>
        </div>
      </section>
    );
  }

  if (error || songs.length === 0) {
    return null;
  }

  return (
    <>
      <section className={`youtube-trending${className ? ` ${className}` : ''}`} aria-label={scopeLabel}>
        <div className="youtube-trending-header">
          <h3 className="youtube-trending-title">{t('playlists.trendingTitle')}</h3>
          <p className="youtube-trending-subtitle">{scopeLabel}</p>
        </div>
        <ul
          className={
            resultLayout === 'video'
              ? 'youtube-search-results youtube-search-results--video youtube-trending-results'
              : 'search-results youtube-search-results youtube-trending-results'
          }
        >
          {songs.map((row) => {
            const inCurrentPlaylist = !pickPlaylistOnAdd && isInCurrentPlaylist(row.videoId);
            const alreadyAdded = pickPlaylistOnAdd && isInAnyPlaylist(row.videoId, row.inLibrary);
            const adding = addingVideoId === row.videoId;
            const thumb = resolveYoutubeThumbnailUrl(row.videoId);
            const addControl = inCurrentPlaylist ? (
              <button
                type="button"
                className="youtube-search-add-btn added"
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
                onClick={() => void handleAdd(row.videoId, row.title)}
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
                onClick={() => void handleAdd(row.videoId, row.title)}
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
            );

            if (resultLayout === 'video') {
              return (
                <li key={row.videoId} className="youtube-search-video-card">
                  <div className="youtube-search-video-card-main">
                    {onPreviewTrack ? (
                      <button
                        type="button"
                        className="youtube-search-video-thumb-btn"
                        onClick={() =>
                          onPreviewTrack({ videoId: row.videoId, title: row.title })
                        }
                        disabled={addingVideoId !== null}
                        aria-label={row.title}
                      >
                        <img
                          className="youtube-search-video-thumb"
                          src={thumb}
                          alt=""
                          loading="lazy"
                        />
                      </button>
                    ) : (
                      <span className="youtube-search-video-thumb-wrap">
                        <img
                          className="youtube-search-video-thumb"
                          src={thumb}
                          alt=""
                          loading="lazy"
                        />
                      </span>
                    )}
                    <span className="youtube-search-video-add">{addControl}</span>
                    <span className="youtube-search-video-meta">
                      <strong className="youtube-search-video-title" title={row.title}>
                        {row.title}
                      </strong>
                      {row.channelTitle ? (
                        <span className="youtube-search-video-channel" title={row.channelTitle}>
                          {row.channelTitle}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            }

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
                {addControl}
              </li>
            );
          })}
        </ul>
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
