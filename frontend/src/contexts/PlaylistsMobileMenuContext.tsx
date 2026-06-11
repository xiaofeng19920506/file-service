'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type PlaylistsMobileMenuContextValue = {
  menuContent: ReactNode | null;
  setMenuContent: (content: ReactNode | null) => void;
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
  const [menuContent, setMenuContent] = useState<ReactNode | null>(null);

  const closeMenu = useCallback(() => {
    onCloseMenu();
  }, [onCloseMenu]);

  const value = useMemo(
    () => ({
      menuContent,
      setMenuContent,
      closeMenu,
    }),
    [menuContent, closeMenu],
  );

  return (
    <PlaylistsMobileMenuContext.Provider value={value}>{children}</PlaylistsMobileMenuContext.Provider>
  );
}

export function usePlaylistsMobileMenu() {
  const ctx = useContext(PlaylistsMobileMenuContext);
  if (!ctx) {
    throw new Error('usePlaylistsMobileMenu must be used within PlaylistsMobileMenuProvider');
  }
  return ctx;
}
