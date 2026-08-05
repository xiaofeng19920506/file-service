import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addInvitePlaylistItems,
  getWorshipPlaylistInvite,
  patchInvitePlaylistItem,
  removeInvitePlaylistItem,
  reorderInvitePlaylistItems,
  type PlaylistDetail,
  type PlaylistItem,
} from '../../api/playlists';
import {
  addBulletinWorshipPlaylistItems,
  getBulletinWorshipPlaylist,
  openBulletinWorshipPlaylist,
  patchBulletinWorshipPlaylistItem,
  removeBulletinWorshipPlaylistItem,
  reorderBulletinWorshipPlaylistItems,
  type BulletinWorshipPlaylistDetail,
} from '../../api/bulletins';
import PlaylistYoutubeSearchPanel from '../PlaylistYoutubeSearchPanel';
import { useSortableVerticalList } from '../../hooks/useSortableVerticalList';
import WorshipTrackActions from './WorshipTrackActions';
import { friendlyError } from '../../lib/error-messages';
import type { PlayClip } from '../../lib/worship-presentation-mode';
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
  const listRef = useRef<HTMLOListElement>(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;

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

  const handleReorderCommit = useCallback(
    async (from: number, toIndex: number) => {
      const current = detailRef.current;
      if (!current) return;
      const reordered = reorderToFinalIndex(current.items, from, toIndex);
      setDetail({ ...current, items: reordered });
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
    },
    [bulletinId, inviteToken, refresh, t],
  );

  const trackSortable = useSortableVerticalList({
    enabled: Boolean(detail && detail.items.length > 1),
    listRef,
    onCommit: (from, toIndex) => void handleReorderCommit(from, toIndex),
  });

  const handleClipSave = async (itemId: string, patch: { playClips: PlayClip[] | null }) => {
    const data = inviteToken
      ? await patchInvitePlaylistItem(inviteToken, itemId, patch)
      : await patchBulletinWorshipPlaylistItem(bulletinId!, itemId, patch);
    setDetail(data);
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
          {inviteToken ? (
            <p className="worship-songs-invite-banner" role="status">
              {t('worshipSongs.inviteGuestHint')}
            </p>
          ) : null}
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
          resultLayout="video"
        />
      </section>

      <section className="worship-songs-panel">
        <h2>{t('worshipSongs.listSection', { count: detail.items.length })}</h2>
        {detail.items.length === 0 ? (
          <p className="playlists-muted">{t('worshipSongs.empty')}</p>
        ) : (
          <>
            {detail.items.length > 1 ? (
              <p className="bulletin-worship-reorder-hint">{t('bulletin.worshipReorderHint')}</p>
            ) : null}
            <ol
              ref={listRef}
              className={`worship-songs-track-list sortable-vertical-list${trackSortable.isSorting ? ' is-sorting' : ''}`}
            >
              {trackSortable.isSorting && trackSortable.getGapIndicatorStyle() ? (
                <li
                  aria-hidden
                  className="sortable-gap-indicator"
                  style={trackSortable.getGapIndicatorStyle()!}
                />
              ) : null}
              {detail.items.map((item, index) => (
                <li
                  key={item.id}
                  className={[
                    'worship-songs-track',
                    'sortable-vertical-item',
                    'is-sortable',
                    trackSortable.isDraggingItem(index) ? 'is-sortable-dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={trackSortable.getItemStyle(index)}
                  {...trackSortable.bindDragHandle(index, { ignoreInteractive: true })}
                >
                  <span className="worship-songs-track-order">{index + 1}</span>
                  <div className="worship-songs-track-main">
                    <WorshipTrackActions
                      item={item}
                      title={item.title}
                      onRemove={() => handleRemove(item)}
                      onClipSave={(patch) => handleClipSave(item.id, patch)}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {message && <p className="success-msg">{message}</p>}
      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}
