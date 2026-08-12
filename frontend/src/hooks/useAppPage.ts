import { useCallback, useEffect, useState } from 'react';
import { APP_HOME_PAGE } from '../lib/permissions';
import { isMobileViewport } from './useMediaQuery';

export type AppPage = 'playlists' | 'playlist-lists' | 'admin' | 'login';

export type AppRoute = {
  page: AppPage;
  playlistId?: string;
  playlistShareToken?: string;
};

const HOME_HASH = '#/playlists';

function normalizeHash(hash: string): string {
  if (!hash || hash === '#' || hash === '#/') return HOME_HASH;
  return hash;
}

function routeFromHash(rawHash: string): AppRoute {
  const hash = normalizeHash(rawHash);
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
  if (hash === '#/login') return { page: 'login' };
  return { page: APP_HOME_PAGE };
}

export function useAppPage() {
  const [route, setRoute] = useState<AppRoute>(() => {
    const raw = window.location.hash;
    // 旧功能 hash → 首页
    if (
      raw.startsWith('#/library') ||
      raw.startsWith('#/merge') ||
      raw.startsWith('#/bulletin') ||
      raw.startsWith('#/worship') ||
      raw.startsWith('#/vip') ||
      raw.startsWith('#/preview/')
    ) {
      if (window.location.hash !== HOME_HASH) {
        window.location.replace(HOME_HASH);
      }
      return { page: APP_HOME_PAGE };
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
      if (
        raw.startsWith('#/library') ||
        raw.startsWith('#/merge') ||
        raw.startsWith('#/bulletin') ||
        raw.startsWith('#/worship') ||
        raw.startsWith('#/vip') ||
        raw.startsWith('#/preview/')
      ) {
        window.location.replace(HOME_HASH);
        setRoute({ page: APP_HOME_PAGE });
        return;
      }
      setRoute(routeFromHash(raw));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: AppPage) => {
    const hash =
      next === 'playlist-lists'
        ? '#/playlists/lists'
        : next === 'playlists'
          ? HOME_HASH
          : next === 'admin'
            ? '#/admin'
            : next === 'login'
              ? '#/login'
              : HOME_HASH;
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

  return {
    page: route.page,
    playlistId: route.playlistId,
    playlistShareToken: route.playlistShareToken,
    navigate,
    navigateToPlaylist,
    navigateClearPlaylistShare,
  };
}
