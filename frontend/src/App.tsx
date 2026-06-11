import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import BlobPreviewPage from './views/BlobPreviewPage';
import MergeEditPage from './views/MergeEditPage';
import AdminPage from './views/AdminPage';
import AuthPage from './views/AuthPage';
import LibraryPage from './views/LibraryPage';
import MergePage from './views/MergePage';
import PlaylistsPage from './views/PlaylistsPage';
import UploadConfirmPage from './views/UploadConfirmPage';
import { useLibraryUpload } from './hooks/useLibraryUpload';
import PageNavTabs from './components/PageNavTabs';
import { CloseIcon, MenuIcon, MoonIcon, SunIcon } from './components/icons';
import { useAppPage } from './hooks/useAppPage';
import { hasStoredSession } from './lib/auth-session';
import { formatUserDisplayName } from './lib/user-name';
import { homePageForPermissions } from './lib/permissions';
import { useI18n } from './i18n';
import {
  PlaylistsMobileMenuProvider,
  PLAYLISTS_MOBILE_MENU_MOUNT_ID,
} from './contexts/PlaylistsMobileMenuContext';

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
    mergePlaylistId,
    navigate,
    navigateToPlaylist,
    navigateClearPlaylistShare,
    navigateToMergeWithPlaylist,
  } = useAppPage();
  const libraryUpload = useLibraryUpload();
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  );
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (loading) return;
    const home = homePageForPermissions(permissions);
    if (page === 'login') {
      if (user || hasStoredSession()) navigate(home);
      return;
    }
    if (page === 'library' && !permissions.canSearch) {
      navigate(home);
      return;
    }
    if (page === 'preview' && !permissions.canDownload) {
      navigate(home);
      return;
    }
    if (page === 'playlists' && !permissions.canAccessPlaylists) {
      navigate(home);
      return;
    }
    if ((page === 'merge' || page === 'merge-edit') && !permissions.canMerge) {
      navigate(home);
      return;
    }
    if (page === 'library-upload' && !permissions.canUpload) {
      navigate(home);
      return;
    }
    if (page === 'admin' && !permissions.canEdit) {
      navigate(home);
    }
  }, [loading, user, page, navigate, permissions]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [page, setMobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setMobileMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mobileMenuOpen, setMobileMenuOpen]);

  useEffect(() => {
    if (page === 'preview' || page === 'login' || page === 'merge-edit' || page === 'library-upload')
      return;
    document.title =
      page === 'playlists'
        ? t('pages.playlistsTitle')
        : page === 'merge'
          ? t('pages.mergeTitle')
          : page === 'admin'
            ? t('pages.adminTitle')
            : page === 'library'
              ? t('pages.libraryTitle')
              : t('pages.playlistsTitle');
  }, [page, t]);

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

  const pageTitle =
    page === 'playlists'
      ? t('nav.playlistsShort')
      : page === 'merge'
        ? t('nav.mergeShort')
        : page === 'admin'
          ? t('nav.adminShort')
          : page === 'library'
            ? t('nav.libraryShort')
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
    <div className={`app${page === 'playlists' ? ' app-playlists' : ''}`}>
      <header className="nav" ref={navRef}>
        <div className="nav-inner">
          <div className="nav-brand">
            <span className="nav-brand-name nav-brand-app-name">{t('app.name')}</span>
            <span className="nav-brand-name nav-brand-page-title">{pageTitle}</span>
            <span className="nav-brand-tagline">{t('app.tagline')}</span>
          </div>

          <div className="nav-center nav-center-desktop">
            <PageNavTabs
              page={page}
              navigate={navigate}
              canSearch={permissions.canSearch}
              canAccessPlaylists={permissions.canAccessPlaylists}
              canMerge={permissions.canMerge}
              canEdit={permissions.canEdit}
              variant="header"
            />
          </div>

          <div className="nav-actions nav-actions-desktop">
            {accountActions}
            {langToggle}
            {themeToggle}
          </div>

          <div className="nav-actions nav-actions-compact">
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

        <div className={`nav-mobile-menu${mobileMenuOpen ? ' is-open' : ''}`} id="nav-mobile-menu" hidden={!mobileMenuOpen}>
          {page === 'playlists' && (
            <div
              id={PLAYLISTS_MOBILE_MENU_MOUNT_ID}
              className="nav-mobile-menu-section nav-mobile-menu-playlists"
            />
          )}
          <div className="nav-mobile-menu-section nav-mobile-menu-account">{accountActions}</div>
          <div className="nav-mobile-menu-section nav-mobile-menu-tools">
            {langToggle}
          </div>
        </div>
      </header>

      <div className="app-content">
        {page === 'library' && permissions.canSearch && <LibraryPage libraryUpload={libraryUpload} />}
        {page === 'playlists' && permissions.canAccessPlaylists && (
          <PlaylistsPage
            selectedId={playlistId}
            shareToken={playlistShareToken}
            onSelectId={navigateToPlaylist}
            onClearShareToken={() => navigateClearPlaylistShare(playlistId)}
            onLoadToMerge={navigateToMergeWithPlaylist}
          />
        )}
        {page === 'merge' && permissions.canMerge && <MergePage mergePlaylistId={mergePlaylistId} />}
        {page === 'admin' && permissions.canEdit && <AdminPage />}
      </div>

      <nav className="nav-bottom" aria-label={t('nav.pages')}>
        <PageNavTabs
          page={page}
          navigate={navigate}
          canSearch={permissions.canSearch}
          canAccessPlaylists={permissions.canAccessPlaylists}
          canMerge={permissions.canMerge}
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
  const { user, loading, permissions } = useAuth();
  const { page, previewBlobId, mergeEditBlobIds, mergeEditTitle } = useAppPage();
  const libraryUpload = useLibraryUpload();
  const { t } = useI18n();

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

  if (page === 'preview' && previewBlobId && permissions.canDownload) {
    return <BlobPreviewPage blobId={previewBlobId} />;
  }

  if (page === 'merge-edit' && mergeEditBlobIds?.length && permissions.canMerge) {
    return <MergeEditPage blobIds={mergeEditBlobIds} title={mergeEditTitle} />;
  }

  if (page === 'library-upload' && permissions.canUpload) {
    return <UploadConfirmPage libraryUpload={libraryUpload} />;
  }

  return <AppShellWithMenu />;
}
