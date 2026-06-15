import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import BlobPreviewPage from './views/BlobPreviewPage';
import MergeEditPage from './views/MergeEditPage';
import AdminPage from './views/AdminPage';
import AuthPage from './views/AuthPage';
import LibraryPage from './views/LibraryPage';
import MergePage from './views/MergePage';
import PlaylistsPage from './views/PlaylistsPage';
import BulletinPage from './views/BulletinPage';
import WorshipPage from './views/WorshipPage';
import WorshipLivePage from './views/WorshipLivePage';
import UploadConfirmPage from './views/UploadConfirmPage';
import { useLibraryUpload } from './hooks/useLibraryUpload';
import PageNavTabs from './components/PageNavTabs';
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
  const drawerRef = useRef<HTMLElement>(null);

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
    if (page === 'playlist-lists' && !permissions.canAccessPlaylists) {
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
      return;
    }
    if (page === 'bulletin' && !permissions.canViewBulletin) {
      navigate(home);
      return;
    }
    if (page === 'worship' && !permissions.canStartWorship) {
      navigate(home);
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
    if (page === 'preview' || page === 'login' || page === 'merge-edit' || page === 'library-upload')
      return;
    document.title =
      page === 'playlists'
        ? t('pages.playlistsTitle')
        : page === 'playlist-lists'
          ? t('pages.playlistListsTitle')
          : page === 'merge'
          ? t('pages.mergeTitle')
          : page === 'admin'
            ? t('pages.adminTitle')
            : page === 'bulletin'
              ? t('pages.bulletinTitle')
              : page === 'worship'
                ? t('pages.worshipTitle')
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

  const { mobileHeader } = usePlaylistsMobileMenu();

  const pageTitle =
    page === 'playlists'
      ? t('nav.playlistsShort')
      : page === 'playlist-lists'
        ? t('nav.playlistListsShort')
        : page === 'merge'
        ? t('nav.mergeShort')
        : page === 'admin'
          ? t('nav.adminShort')
          : page === 'bulletin'
            ? t('nav.bulletinShort')
            : page === 'worship'
              ? t('nav.worshipShort')
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
    <div className={`app${page === 'playlists' || page === 'playlist-lists' ? ' app-playlists' : ''}${mobileMenuOpen ? ' nav-mobile-menu-open' : ''}`}>
      <header className="nav">
        <div className="nav-inner">
          <div className={`nav-brand${mobileHeader ? ' nav-brand--with-back' : ''}`}>
            {mobileHeader ? (
              <>
                <button
                  type="button"
                  className="nav-back-btn"
                  onClick={mobileHeader.onBack}
                  aria-label={t('playlists.backToList')}
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

          <div className="nav-center nav-center-desktop">
            <PageNavTabs
              page={page}
              navigate={navigate}
              canSearch={permissions.canSearch}
              canAccessPlaylists={permissions.canAccessPlaylists}
              canMerge={permissions.canMerge}
              canViewBulletin={permissions.canViewBulletin}
              canStartWorship={permissions.canStartWorship}
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
            aria-label={t('metadata.close')}
            onClick={() => setMobileMenuOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="nav-mobile-menu nav-mobile-drawer-body">
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
      </aside>

      <div className="app-content">
        {page === 'library' && permissions.canSearch && <LibraryPage libraryUpload={libraryUpload} />}
        {(page === 'playlists' || page === 'playlist-lists') && permissions.canAccessPlaylists && (
          <PlaylistsPage
            mobileHome={page === 'playlist-lists' ? 'lists' : 'search'}
            selectedId={playlistId}
            shareToken={playlistShareToken}
            onSelectId={navigateToPlaylist}
            onClearShareToken={() => navigateClearPlaylistShare(playlistId)}
            onLoadToMerge={navigateToMergeWithPlaylist}
          />
        )}
        {page === 'merge' && permissions.canMerge && <MergePage mergePlaylistId={mergePlaylistId} />}
        {page === 'bulletin' && permissions.canViewBulletin && <BulletinPage />}
        {page === 'worship' && permissions.canStartWorship && <WorshipPage />}
        {page === 'admin' && permissions.canEdit && <AdminPage />}
      </div>

      <nav className="nav-bottom" aria-label={t('nav.pages')}>
        <PageNavTabs
          page={page}
          navigate={navigate}
          canSearch={permissions.canSearch}
          canAccessPlaylists={permissions.canAccessPlaylists}
          canMerge={permissions.canMerge}
          canViewBulletin={permissions.canViewBulletin}
          canStartWorship={permissions.canStartWorship}
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
  const { page, previewBlobId, mergeEditBlobIds, mergeEditTitle, worshipPlaylistId, worshipBulletinId, worshipMode } = useAppPage();
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

  if (
    page === 'worship-live' &&
    worshipPlaylistId &&
    worshipMode &&
    permissions.canStartWorship
  ) {
    return (
      <WorshipLivePage
        playlistId={worshipPlaylistId}
        bulletinId={worshipBulletinId}
        mode={worshipMode}
      />
    );
  }

  if (page === 'worship-live') {
    window.location.hash = '#/worship';
    return (
      <div className="auth-page">
        <p className="auth-loading">{t('worship.loading')}</p>
      </div>
    );
  }

  return <AppShellWithMenu />;
}
