import { useCallback, useEffect, useState } from 'react';
import { APP_HOME_PAGE } from '../lib/permissions';
import { isMobileViewport } from './useMediaQuery';

export type AppPage =
  | 'library'
  | 'library-upload'
  | 'merge'
  | 'merge-edit'
  | 'playlists'
  | 'playlist-lists'
  | 'admin'
  | 'login'
  | 'preview'
  | 'bulletin'
  | 'bulletin-slideshow-presenter'
  | 'bulletin-slideshow-projector'
  | 'worship'
  | 'worship-songs'
  | 'worship-live';

export type AppRoute = {
  page: AppPage;
  previewBlobId?: string;
  mergeEditBlobIds?: string[];
  mergeEditTitle?: string;
  playlistId?: string;
  playlistShareToken?: string;
  mergePlaylistId?: string;
  worshipPlaylistId?: string;
  worshipBulletinId?: string;
  worshipMode?: 'youtube' | 'ppt';
  worshipSongsInviteToken?: string;
  slideshowSessionId?: string;
};

const HOME_HASH = '#/playlists';

function normalizeHash(hash: string): string {
  if (!hash || hash === '#' || hash === '#/') return HOME_HASH;
  return hash;
}

function routeFromHash(rawHash: string): AppRoute {
  const hash = normalizeHash(rawHash);
  if (hash.startsWith('#/merge/edit')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const blobs = params.get('blobs')?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
    if (blobs.length > 0) {
      return {
        page: 'merge-edit',
        mergeEditBlobIds: blobs,
        mergeEditTitle: params.get('title')?.trim() || undefined,
      };
    }
  }
  if (hash.startsWith('#/preview/')) {
    const blobId = hash.slice('#/preview/'.length).split('?')[0]?.trim();
    if (blobId) return { page: 'preview', previewBlobId: blobId };
  }
  if (hash === '#/library/upload') return { page: 'library-upload' };
  if (hash.startsWith('#/merge')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const mergePlaylistId = params.get('playlist')?.trim() || undefined;
    return { page: 'merge', mergePlaylistId };
  }
  if (hash.startsWith('#/playlists/lists')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const hasShare = Boolean(params.get('share')?.trim());
    const hasYoutubeOauth = Boolean(params.get('youtube_oauth')?.trim());
    const keepIdInUrl = !isMobileViewport() || hasShare || hasYoutubeOauth;
    const playlistId = keepIdInUrl ? params.get('id')?.trim() || undefined : undefined;
    const playlistShareToken = params.get('share')?.trim() || undefined;
    return { page: 'playlist-lists', playlistId, playlistShareToken };
  }
  if (hash.startsWith('#/playlists')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const hasShare = Boolean(params.get('share')?.trim());
    const hasYoutubeOauth = Boolean(params.get('youtube_oauth')?.trim());
    const keepIdInUrl = !isMobileViewport() || hasShare || hasYoutubeOauth;
    const playlistId = keepIdInUrl ? params.get('id')?.trim() || undefined : undefined;
    const playlistShareToken = params.get('share')?.trim() || undefined;
    return { page: 'playlists', playlistId, playlistShareToken };
  }
  if (hash === '#/admin') return { page: 'admin' };
  if (hash.startsWith('#/worship/live')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const worshipPlaylistId = params.get('playlist')?.trim() || undefined;
    const worshipBulletinId = params.get('bulletin')?.trim() || undefined;
    const modeRaw = params.get('mode')?.trim();
    const worshipMode = modeRaw === 'youtube' || modeRaw === 'ppt' ? modeRaw : undefined;
    if (worshipPlaylistId && worshipMode) {
      return {
        page: 'worship-live',
        worshipPlaylistId,
        worshipBulletinId,
        worshipMode,
      };
    }
  }
  if (hash === '#/worship' || hash.startsWith('#/worship?')) return { page: 'worship' };
  if (hash.startsWith('#/worship-songs')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const worshipSongsInviteToken = params.get('invite')?.trim() || undefined;
    if (worshipSongsInviteToken) {
      return { page: 'worship-songs', worshipSongsInviteToken };
    }
  }
  if (hash.startsWith('#/bulletin/slideshow/projector')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const slideshowSessionId = params.get('session')?.trim() || undefined;
    if (slideshowSessionId) {
      return { page: 'bulletin-slideshow-projector', slideshowSessionId };
    }
  }
  if (hash.startsWith('#/bulletin/slideshow/presenter')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const slideshowSessionId = params.get('session')?.trim() || undefined;
    if (slideshowSessionId) {
      return { page: 'bulletin-slideshow-presenter', slideshowSessionId };
    }
  }
  if (hash === '#/bulletin' || hash.startsWith('#/bulletin?')) return { page: 'bulletin' };
  if (hash === '#/login') return { page: 'login' };
  if (hash.startsWith('#/library')) return { page: 'library' };
  return { page: APP_HOME_PAGE };
}

export function useAppPage() {
  const [route, setRoute] = useState<AppRoute>(() => {
    const normalized = normalizeHash(window.location.hash);
    if (window.location.hash !== normalized) {
      window.location.replace(normalized);
    }
    return routeFromHash(normalized);
  });

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: Exclude<AppPage, 'preview' | 'merge-edit' | 'library-upload'>) => {
    const hash =
      next === 'merge'
        ? '#/merge'
        : next === 'playlist-lists'
          ? '#/playlists/lists'
          : next === 'playlists'
            ? HOME_HASH
            : next === 'admin'
              ? '#/admin'
              : next === 'bulletin'
                ? '#/bulletin'
                : next === 'worship'
                  ? '#/worship'
                  : next === 'login'
                ? '#/login'
                : '#/library';
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setRoute(routeFromHash(hash));
  }, []);

  const navigateToPlaylist = useCallback((id?: string) => {
    const isMobile = isMobileViewport();
    const listsRoute = window.location.hash.startsWith('#/playlists/lists');
    const keepIdInUrl = Boolean(id) && !isMobile;
    const hash = keepIdInUrl
      ? `#/playlists?id=${encodeURIComponent(id!)}`
      : listsRoute
        ? '#/playlists/lists'
        : HOME_HASH;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    const next = routeFromHash(hash);
    // 始终以显式选择同步 state，避免 routeFromHash 与 navigate 的视口判断不一致
    next.playlistId = id;
    setRoute(next);
  }, []);

  const navigateClearPlaylistShare = useCallback((id?: string) => {
    navigateToPlaylist(id);
  }, [navigateToPlaylist]);

  const navigateToMergeWithPlaylist = useCallback((playlistId: string) => {
    const hash = `#/merge?playlist=${encodeURIComponent(playlistId)}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setRoute(routeFromHash(hash));
  }, []);

  return {
    page: route.page,
    previewBlobId: route.previewBlobId,
    mergeEditBlobIds: route.mergeEditBlobIds,
    mergeEditTitle: route.mergeEditTitle,
    playlistId: route.playlistId,
    playlistShareToken: route.playlistShareToken,
    mergePlaylistId: route.mergePlaylistId,
    worshipPlaylistId: route.worshipPlaylistId,
    worshipBulletinId: route.worshipBulletinId,
    worshipMode: route.worshipMode,
    worshipSongsInviteToken: route.worshipSongsInviteToken,
    slideshowSessionId: route.slideshowSessionId,
    navigate,
    navigateToPlaylist,
    navigateClearPlaylistShare,
    navigateToMergeWithPlaylist,
  };
}
