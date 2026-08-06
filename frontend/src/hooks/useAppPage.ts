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
  | 'worship-songs'
  | 'bulletin-section-invite'
  | 'vip-video';

export type AppRoute = {
  page: AppPage;
  previewBlobId?: string;
  mergeEditBlobIds?: string[];
  mergeEditTitle?: string;
  playlistId?: string;
  playlistShareToken?: string;
  mergePlaylistId?: string;
  worshipSongsInviteToken?: string;
  worshipSongsBulletinId?: string;
  bulletinSectionInviteToken?: string;
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
  // 旧「敬拜」独立页已下线，落到周报（hash 在 useAppPage 初始化时改写）
  if (hash === '#/worship' || hash.startsWith('#/worship?') || hash.startsWith('#/worship/live')) {
    return { page: 'bulletin' };
  }
  if (hash.startsWith('#/worship-songs')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const worshipSongsInviteToken = params.get('invite')?.trim() || undefined;
    const worshipSongsBulletinId = params.get('bulletin')?.trim() || undefined;
    if (worshipSongsInviteToken) {
      return { page: 'worship-songs', worshipSongsInviteToken };
    }
    if (worshipSongsBulletinId) {
      return { page: 'worship-songs', worshipSongsBulletinId };
    }
  }
  if (hash.startsWith('#/bulletin-section-invite')) {
    const qIndex = hash.indexOf('?');
    const params =
      qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));
    const bulletinSectionInviteToken = params.get('token')?.trim() || undefined;
    if (bulletinSectionInviteToken) {
      return { page: 'bulletin-section-invite', bulletinSectionInviteToken };
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
  if (hash === '#/vip' || hash.startsWith('#/vip?')) return { page: 'vip-video' };
  if (hash.startsWith('#/library')) return { page: 'library' };
  return { page: APP_HOME_PAGE };
}

export function useAppPage() {
  const [route, setRoute] = useState<AppRoute>(() => {
    const raw = window.location.hash;
    const isLegacyWorship =
      raw === '#/worship' || raw.startsWith('#/worship?') || raw.startsWith('#/worship/live');
    if (isLegacyWorship) {
      window.location.replace('#/bulletin');
      return { page: 'bulletin' };
    }
    const normalized = normalizeHash(raw);
    if (window.location.hash !== normalized) {
      window.location.replace(normalized);
    }
    return routeFromHash(normalized);
  });

  useEffect(() => {
    const onHashChange = () => {
      const raw = window.location.hash;
      const isLegacyWorship =
        raw === '#/worship' || raw.startsWith('#/worship?') || raw.startsWith('#/worship/live');
      if (isLegacyWorship) {
        window.location.replace('#/bulletin');
        setRoute({ page: 'bulletin' });
        return;
      }
      setRoute(routeFromHash(raw));
    };
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
                : next === 'vip-video'
                  ? '#/vip'
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
    worshipSongsInviteToken: route.worshipSongsInviteToken,
    worshipSongsBulletinId: route.worshipSongsBulletinId,
    bulletinSectionInviteToken: route.bulletinSectionInviteToken,
    slideshowSessionId: route.slideshowSessionId,
    navigate,
    navigateToPlaylist,
    navigateClearPlaylistShare,
    navigateToMergeWithPlaylist,
  };
}
