import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import AdminPage from './views/AdminPage';
import AuthPage from './views/AuthPage';
import PlaylistsPage from './views/PlaylistsPage';
import PageNavTabs from './components/PageNavTabs';
import HeardAudioCacheSetting from './components/HeardAudioCacheSetting';
import { CloseIcon, ChevronLeftIcon, MenuIcon, MoonIcon, SunIcon } from './components/icons';
import { useAppPage } from './hooks/useAppPage';
import { hasStoredSession } from './lib/auth-session';
import { formatUserDisplayName } from './lib/user-name';
import { homePageForPermissions } from './lib/permissions';
import { useI18n } from './i18n';
import {
  PlaylistsMobileMenuProvider,
  PLAYLISTS_MOBILE_MENU_MOUNT_ID,
  usePlaylistsMobileMenu,
} from './contexts/PlaylistsMobileMenuContext';
import { registerHeardAudioServiceWorker } from './lib/heard-audio-sw-register';
import { readHeardAudioCacheEnabled } from './lib/heard-audio-cache-preference';

function AppShellInner({
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { t, locale, setLocale } = useI18n();
  const { user, loading, logout, permissions, isAdmin } = useAuth();
  const {
    page,
    playlistId,
    playlistShareToken,
    navigate,
    navigateToPlaylist,
    navigateClearPlaylistShare,
  } = useAppPage();
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    const home = homePageForPermissions(permissions);
    if (page === 'login') {
      if (user || hasStoredSession()) navigate(home);
      return;
    }
    if (page === 'playlists' && !permissions.canAccessPlaylists) {
      navigate(home);
      return;
    }
    if (page === 'playlist-lists' && !permissions.canAccessPlaylists) {
      navigate(home);
      return;
    }
    if (page === 'admin' && !permissions.canEdit) {
      navigate(home);
      return;
    }
  }, [loading, user, page, navigate, permissions]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [page, setMobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen, setMobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (page === 'login') return;
    document.title =
      page === 'playlists'
        ? t('pages.playlistsTitle')
        : page === 'playlist-lists'
          ? t('pages.playlistListsTitle')
          : page === 'admin'
            ? t('pages.adminTitle')
            : t('pages.playlistsTitle');
  }, [page, t]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsPanelRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[data-settings-toggle]')) return;
      setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [settingsOpen]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  };

  const goLogin = () => {
    window.location.hash = '#/login';
  };

  const langToggle = (
    <div className="lang-toggle" role="group" aria-label={t('nav.lang')}>
      <button
        type="button"
        className={`lang-btn${locale === 'zh-CN' ? ' active' : ''}`}
        onClick={() => setLocale('zh-CN')}
      >
        中
      </button>
      <button
        type="button"
        className={`lang-btn${locale === 'en' ? ' active' : ''}`}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
    </div>
  );

  const themeToggle = (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );

  const settingsToggle = (
    <button
      type="button"
      className="settings-toggle"
      data-settings-toggle=""
      aria-expanded={settingsOpen}
      aria-controls="app-settings-panel"
      aria-label={t('nav.settings')}
      onClick={() => setSettingsOpen((open) => !open)}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path
          fill="currentColor"
          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.24l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.24l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"
        />
      </svg>
    </button>
  );

  const settingsPanel = settingsOpen ? (
    <div
      ref={settingsPanelRef}
      id="app-settings-panel"
      className="app-settings-panel"
      role="dialog"
      aria-label={t('settings.title')}
    >
      <div className="app-settings-panel-head">
        <span>{t('settings.title')}</span>
        <button
          type="button"
          className="app-settings-panel-close"
          aria-label={t('common.close')}
          onClick={() => setSettingsOpen(false)}
        >
          <CloseIcon />
        </button>
      </div>
      <HeardAudioCacheSetting />
    </div>
  ) : null;

  const { mobileHeader } = usePlaylistsMobileMenu();

  const pageTitle =
    page === 'playlists'
      ? t('nav.playlistsShort')
      : page === 'playlist-lists'
        ? t('nav.playlistListsShort')
        : page === 'admin'
          ? t('nav.adminShort')
          : t('nav.playlistsShort');

  const accountActions = user ? (
    <>
      <span className="nav-user" title={user.email}>
        {formatUserDisplayName(user)}
        {isAdmin && <span className="nav-user-badge">{t('auth.adminBadge')}</span>}
      </span>
      <button type="button" className="btn-secondary btn-logout" onClick={logout}>
        {t('auth.logout')}
      </button>
    </>
  ) : (
    <button type="button" className="btn-primary btn-login" onClick={goLogin}>
      {t('auth.login')}
    </button>
  );

  return (
    <div
      className={`app${page === 'playlists' || page === 'playlist-lists' ? ' app-playlists' : ''}${
        mobileMenuOpen ? ' nav-mobile-menu-open' : ''
      }`}
    >
      <header className="nav">
        <div className="nav-inner">
          <div className={`nav-brand${mobileHeader ? ' nav-brand--with-back' : ''}`}>
            {mobileHeader ? (
              <>
                <button
                  type="button"
                  className="nav-back-btn"
                  onClick={mobileHeader.onBack}
                  aria-label={mobileHeader.backAriaLabel ?? t('playlists.backToList')}
                >
                  <ChevronLeftIcon />
                </button>
                <span className="nav-brand-name nav-brand-page-title nav-brand-detail-title">
                  {mobileHeader.title}
                </span>
              </>
            ) : (
              <>
                <span className="nav-brand-name nav-brand-app-name">{t('app.name')}</span>
                {page !== 'playlist-lists' && (
                  <span className="nav-brand-name nav-brand-page-title">{pageTitle}</span>
                )}
                <span className="nav-brand-tagline">{t('app.tagline')}</span>
              </>
            )}
          </div>

          {permissions.canEdit ? (
            <div className="nav-center nav-center-tabs">
              <PageNavTabs
                page={page}
                navigate={navigate}
                canAccessPlaylists={permissions.canAccessPlaylists}
                canEdit={permissions.canEdit}
                variant="header"
              />
            </div>
          ) : null}

          <div className="nav-actions nav-actions-desktop">
            {accountActions}
            {langToggle}
            {settingsToggle}
            {themeToggle}
          </div>

          <div className="nav-actions nav-actions-compact">
            {settingsToggle}
            {themeToggle}
            <button
              type="button"
              className="nav-menu-btn"
              aria-expanded={mobileMenuOpen}
              aria-controls="nav-mobile-menu"
              aria-label={t('nav.menu')}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
        {settingsPanel}
      </header>

      <div
        className={`nav-mobile-drawer-backdrop${mobileMenuOpen ? ' is-visible' : ''}`}
        aria-hidden={!mobileMenuOpen}
        onClick={() => setMobileMenuOpen(false)}
      />

      <aside
        ref={drawerRef}
        className={`nav-mobile-drawer${mobileMenuOpen ? ' is-open' : ''}`}
        id="nav-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.menu')}
        aria-hidden={!mobileMenuOpen}
      >
        <div className="nav-mobile-drawer-head">
          <span className="nav-mobile-drawer-title">{pageTitle}</span>
          <button
            type="button"
            className="nav-mobile-drawer-close"
            aria-label={t('common.close')}
            onClick={() => setMobileMenuOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="nav-mobile-menu nav-mobile-drawer-body">
          {permissions.canEdit && (
            <div className="nav-mobile-menu-section nav-mobile-menu-nav">
              <PageNavTabs
                page={page}
                navigate={(next) => {
                  navigate(next);
                  setMobileMenuOpen(false);
                }}
                canAccessPlaylists={permissions.canAccessPlaylists}
                canEdit={permissions.canEdit}
                variant="header"
              />
            </div>
          )}
          {page === 'playlists' && (
            <div
              id={PLAYLISTS_MOBILE_MENU_MOUNT_ID}
              className="nav-mobile-menu-section nav-mobile-menu-playlists"
            />
          )}
          <div className="nav-mobile-menu-section nav-mobile-menu-account">{accountActions}</div>
          <div className="nav-mobile-menu-section nav-mobile-menu-settings">
            <p className="nav-mobile-menu-section-title">{t('settings.title')}</p>
            <HeardAudioCacheSetting />
          </div>
          <div className="nav-mobile-menu-section nav-mobile-menu-tools">
            {langToggle}
          </div>
        </div>
      </aside>

      <div className="app-content">
        {(page === 'playlists' || page === 'playlist-lists') && permissions.canAccessPlaylists && (
          <PlaylistsPage
            mobileHome={page === 'playlist-lists' ? 'lists' : 'search'}
            selectedId={playlistId}
            shareToken={playlistShareToken}
            onSelectId={navigateToPlaylist}
            onClearShareToken={() => navigateClearPlaylistShare(playlistId)}
          />
        )}
        {page === 'admin' && permissions.canEdit && <AdminPage />}
      </div>

      <nav className="nav-bottom" aria-label={t('nav.pages')}>
        <PageNavTabs
          page={page}
          navigate={navigate}
          canAccessPlaylists={permissions.canAccessPlaylists}
          canEdit={permissions.canEdit}
          variant="bottom"
        />
      </nav>
    </div>
  );
}

function AppShellWithMenu() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <PlaylistsMobileMenuProvider onCloseMenu={closeMenu}>
      <AppShellInner mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
    </PlaylistsMobileMenuProvider>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const { page } = useAppPage();
  const { t } = useI18n();

  useEffect(() => {
    if (!readHeardAudioCacheEnabled()) return;
    void registerHeardAudioServiceWorker();
  }, []);

  if (loading) {
    return (
      <div className="auth-page">
        <p className="auth-loading">{t('auth.checkingSession')}</p>
      </div>
    );
  }

  if (page === 'login' && !user) {
    return <AuthPage />;
  }

  if (!user && page !== 'login') {
    if (window.location.hash !== '#/login') {
      window.location.hash = '#/login';
    }
    return <AuthPage />;
  }

  return <AppShellWithMenu />;
}
