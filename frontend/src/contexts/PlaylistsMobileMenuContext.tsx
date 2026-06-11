'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const PLAYLISTS_MOBILE_MENU_MOUNT_ID = 'playlists-mobile-menu-mount';

type PlaylistsMobileMenuContextValue = {
  closeMenu: () => void;
};

const PlaylistsMobileMenuContext = createContext<PlaylistsMobileMenuContextValue | null>(null);

export function PlaylistsMobileMenuProvider({
  children,
  onCloseMenu,
}: {
  children: ReactNode;
  onCloseMenu: () => void;
}) {
  const closeMenu = useCallback(() => {
    onCloseMenu();
  }, [onCloseMenu]);

  return (
    <PlaylistsMobileMenuContext.Provider value={{ closeMenu }}>
      {children}
    </PlaylistsMobileMenuContext.Provider>
  );
}

export function usePlaylistsMobileMenu() {
  const ctx = useContext(PlaylistsMobileMenuContext);
  if (!ctx) {
    throw new Error('usePlaylistsMobileMenu must be used within PlaylistsMobileMenuProvider');
  }
  return ctx;
}

export function PlaylistsMobileMenuPortal({ children }: { children: ReactNode }) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setMount(document.getElementById(PLAYLISTS_MOBILE_MENU_MOUNT_ID));
  }, []);

  if (!mount || !children) return null;
  return createPortal(children, mount);
}
