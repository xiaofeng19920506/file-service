import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addBulletinWorshipPlaylistItems,
  getBulletinWorshipPlaylist,
  openBulletinWorshipPlaylist,
  removeBulletinWorshipPlaylistItem,
  reorderBulletinWorshipPlaylistItems,
  type BulletinWorshipPlaylistDetail,
} from '../../api/bulletins';
import {
  addInvitePlaylistItems,
  getWorshipPlaylistInvite,
  removeInvitePlaylistItem,
  reorderInvitePlaylistItems,
  type PlaylistDetail,
  type PlaylistItem,
} from '../../api/playlists';
import PlaylistYoutubeSearchPanel from '../PlaylistYoutubeSearchPanel';
import { friendlyError } from '../../lib/error-messages';
import { useI18n } from '../../i18n';

export type WorshipSongsEditorProps = {
  inviteToken?: string;
  bulletinId?: string;
  compact?: boolean;
};

function reorderToFinalIndex<T>(items: T[], from: number, toIndex: number): T[] {
  if (from === toIndex || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

type EditorMeta = {
  serviceDate: string;
  serviceTime: string;
  title: string;
};

export default function WorshipSongsEditor({
  inviteToken,
  bulletinId,
  compact = false,
}: WorshipSongsEditorProps) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [meta, setMeta] = useState<EditorMeta | null>(null);
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

  const applyDetail = (data: PlaylistDetail | BulletinWorshipPlaylistDetail, m: EditorMeta) => {
    setDetail(data);
    setMeta(m);
  };

  const refresh = useCallback(async () => {
    if (inviteToken) {
      const data = await getWorshipPlaylistInvite(inviteToken);
      applyDetail(data, {
        serviceDate: data.bulletin.serviceDate,
        serviceTime: data.bulletin.serviceTime,
        title: data.playlist.title,
      });
      return;
    }
    if (!bulletinId) throw new Error('invalid_request');

    let data = await getBulletinWorshipPlaylist(bulletinId);
    if (!data.playlist) {
      data = await openBulletinWorshipPlaylist(bulletinId);
    }
    if (!data.playlist) throw new Error('not_found');
    applyDetail(data, {
      serviceDate: data.bulletin.serviceDate,
      serviceTime: data.bulletin.serviceTime,
      title: data.playlist.title,
    });
  }, [bulletinId, inviteToken]);

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
            friendlyError(
              err instanceof Error ? err.message : inviteToken ? 'invalid_invite_token' : 'load_playlist_failed',
              t,
            ),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, bulletinId, refresh, t]);

  const handleAdded = (next: PlaylistDetail, added: { addedCount: number; skippedCount: number }) => {
    setDetail(next);
    if (added.addedCount > 0) {
      setMessage(t('worshipSongs.addedCount', { count: added.addedCount }));
    } else if (added.skippedCount > 0) {
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
      const data = inviteToken
        ? await addInvitePlaylistItems(inviteToken, trimmed)
        : await addBulletinWorshipPlaylistItems(bulletinId!, trimmed);
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
      if (inviteToken) {
        await removeInvitePlaylistItem(inviteToken, item.id);
      } else {
        await removeBulletinWorshipPlaylistItem(bulletinId!, item.id);
      }
      setDetail((prev) =>
        prev ? { ...prev, items: prev.items.filter((row) => row.id !== item.id) } : prev,
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
      const data = inviteToken
        ? await reorderInvitePlaylistItems(
            inviteToken,
            reordered.map((item) => item.id),
          )
        : await reorderBulletinWorshipPlaylistItems(
            bulletinId!,
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
    return <p className="error-msg">{error}</p>;
  }

  if (!detail || !meta) return null;

  return (
    <div className={compact ? 'worship-songs-editor worship-songs-editor--compact' : 'worship-songs-page'}>
      {!compact && (
        <header className="worship-songs-header">
          <h1>{t('worshipSongs.title')}</h1>
          <p className="worship-songs-intro">
            {t('worshipSongs.intro', {
              date: meta.serviceDate,
              time: meta.serviceTime,
              title: meta.title,
            })}
          </p>
        </header>
      )}

      <section className="worship-songs-panel">
        {!compact && <h2>{t('worshipSongs.addSection')}</h2>}
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
          bulletinId={bulletinId}
          existingVideoIds={existingVideoIds}
          onAdded={handleAdded}
          showHint={!compact}
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
