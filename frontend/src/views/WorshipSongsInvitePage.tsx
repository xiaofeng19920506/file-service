import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addInvitePlaylistItems,
  getWorshipPlaylistInvite,
  removeInvitePlaylistItem,
  reorderInvitePlaylistItems,
  type PlaylistDetail,
  type PlaylistItem,
} from '../api/playlists';
import PlaylistYoutubeSearchPanel from '../components/PlaylistYoutubeSearchPanel';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type WorshipSongsInvitePageProps = {
  inviteToken: string;
};

function reorderToFinalIndex<T>(items: T[], from: number, toIndex: number): T[] {
  if (from === toIndex || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

export default function WorshipSongsInvitePage({ inviteToken }: WorshipSongsInvitePageProps) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [serviceDate, setServiceDate] = useState('');
  const [serviceTime, setServiceTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const existingVideoIds = useMemo(
    () => new Set(detail?.items.map((item) => item.youtubeVideoId) ?? []),
    [detail?.items],
  );

  const refresh = useCallback(async () => {
    const data = await getWorshipPlaylistInvite(inviteToken);
    setDetail(data);
    setServiceDate(data.bulletin.serviceDate);
    setServiceTime(data.bulletin.serviceTime);
  }, [inviteToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setError(
            friendlyError(err instanceof Error ? err.message : 'invalid_invite_token', t),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, refresh, t]);

  const handleAdded = (next: PlaylistDetail, meta: { addedCount: number; skippedCount: number }) => {
    setDetail(next);
    if (meta.addedCount > 0) {
      setMessage(t('worshipSongs.addedCount', { count: meta.addedCount }));
    } else if (meta.skippedCount > 0) {
      setMessage(t('worshipSongs.duplicateSkipped'));
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || addingUrl) return;
    setAddingUrl(true);
    setError(null);
    setMessage(null);
    try {
      const data = await addInvitePlaylistItems(inviteToken, trimmed);
      handleAdded(data, { addedCount: data.addedCount, skippedCount: data.skippedCount });
      setUrl('');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'add_playlist_item_failed', t));
    } finally {
      setAddingUrl(false);
    }
  };

  const handleRemove = async (item: PlaylistItem) => {
    setError(null);
    try {
      await removeInvitePlaylistItem(inviteToken, item.id);
      setDetail((prev) =>
        prev
          ? { ...prev, items: prev.items.filter((row) => row.id !== item.id) }
          : prev,
      );
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'remove_playlist_item_failed', t));
    }
  };

  const handleDrop = async (toIndex: number) => {
    if (!detail || dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      return;
    }
    const reordered = reorderToFinalIndex(detail.items, dragIndex, toIndex);
    setDragIndex(null);
    setDetail({ ...detail, items: reordered });
    try {
      const data = await reorderInvitePlaylistItems(
        inviteToken,
        reordered.map((item) => item.id),
      );
      setDetail(data);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'reorder_playlist_failed', t));
      await refresh();
    }
  };

  if (loading) {
    return <p className="worship-songs-loading">{t('worshipSongs.loading')}</p>;
  }

  if (error && !detail) {
    return (
      <div className="worship-songs-page">
        <p className="error-msg">{error}</p>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="worship-songs-page">
      <header className="worship-songs-header">
        <h1>{t('worshipSongs.title')}</h1>
        <p className="worship-songs-intro">
          {t('worshipSongs.intro', {
            date: serviceDate,
            time: serviceTime,
            title: detail.playlist.title,
          })}
        </p>
      </header>

      <section className="worship-songs-panel">
        <h2>{t('worshipSongs.addSection')}</h2>
        <form className="worship-songs-url-form" onSubmit={(e) => void handleUrlSubmit(e)}>
          <label className="share-playlist-field">
            <span>{t('playlists.addUrlLabel')}</span>
            <input
              type="url"
              className="playlists-text-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('playlists.addPlaceholder')}
              disabled={addingUrl}
            />
          </label>
          <p className="playlists-muted">{t('worshipSongs.urlHint')}</p>
          <button type="submit" className="btn-primary" disabled={addingUrl || !url.trim()}>
            {addingUrl ? t('playlists.adding') : t('playlists.addConfirm')}
          </button>
        </form>

        <PlaylistYoutubeSearchPanel
          inviteToken={inviteToken}
          existingVideoIds={existingVideoIds}
          onAdded={handleAdded}
          showHint
        />
      </section>

      <section className="worship-songs-panel">
        <h2>{t('worshipSongs.listSection', { count: detail.items.length })}</h2>
        {detail.items.length === 0 ? (
          <p className="playlists-muted">{t('worshipSongs.empty')}</p>
        ) : (
          <ol className="worship-songs-track-list">
            {detail.items.map((item, index) => (
              <li
                key={item.id}
                className={`worship-songs-track${dragIndex === index ? ' worship-songs-track--drag' : ''}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void handleDrop(index)}
              >
                <span className="worship-songs-track-order">{index + 1}</span>
                <span className="worship-songs-track-title">{item.title}</span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => void handleRemove(item)}
                >
                  {t('playlists.removeTrackShort')}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {message && <p className="success-msg">{message}</p>}
      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}
