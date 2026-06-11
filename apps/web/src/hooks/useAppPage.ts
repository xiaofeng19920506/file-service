import { useCallback, useEffect, useState } from 'react';

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

function routeFromHash(hash: string): AppRoute {
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
    const playlistId = params.get('id')?.trim() || undefined;
    const playlistShareToken = params.get('share')?.trim() || undefined;
    return { page: 'playlists', playlistId, playlistShareToken };
  }
  if (hash === '#/admin') return { page: 'admin' };
  if (hash === '#/login') return { page: 'login' };
  return { page: 'library' };
}

export function useAppPage() {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (!window.location.hash) {
      window.location.replace('#/library');
    }
    return routeFromHash(window.location.hash);
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
          ? '#/playlists'
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
    const hash = id ? `#/playlists?id=${encodeURIComponent(id)}` : '#/playlists';
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setRoute(routeFromHash(hash));
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
