import { useCallback, useEffect, useState } from 'react';
import { APP_HOME_PAGE } from '../lib/permissions';
import { isMobileViewport } from './useMediaQuery';

export type AppPage =
  | 'library'
  | 'library-upload'
  | 'merge'
  | 'merge-edit'
  | 'playlists'
  | 'admin'
  | 'login'
  | 'preview';

export type AppRoute = {
  page: AppPage;
  previewBlobId?: string;
  mergeEditBlobIds?: string[];
  mergeEditTitle?: string;
  playlistId?: string;
  playlistShareToken?: string;
  mergePlaylistId?: string;
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
        : next === 'playlists'
          ? HOME_HASH
          : next === 'admin'
            ? '#/admin'
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
    const keepIdInUrl = Boolean(id) && !isMobile;
    const hash = keepIdInUrl ? `#/playlists?id=${encodeURIComponent(id!)}` : HOME_HASH;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    const next = routeFromHash(hash);
    if (isMobile) {
      next.playlistId = id;
    }
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
    navigate,
    navigateToPlaylist,
    navigateClearPlaylistShare,
    navigateToMergeWithPlaylist,
  };
}
