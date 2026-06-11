import { useEffect, useRef, useState } from 'react';
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
import { useI18n } from './i18n';
import './App.css';
import './styles/apple-design.css';

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const { user, loading, logout, permissions, isAdmin } = useAuth();
  const {
    page,
    previewBlobId,
    mergeEditBlobIds,
    mergeEditTitle,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (loading) return;
    if (page === 'login') {
      if (user || hasStoredSession()) navigate('library');
      return;
    }
    if (page === 'preview' && !permissions.canDownload) {
      navigate('library');
      return;
    }
    if ((page === 'merge' || page === 'merge-edit' || page === 'playlists') && !permissions.canMerge) {
      navigate('library');
      return;
    }
    if (page === 'library-upload' && !permissions.canUpload) {
      navigate('library');
      return;
    }
    if (page === 'admin' && !permissions.canEdit) {
      navigate('library');
    }
  }, [loading, user, page, navigate, permissions]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [page]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setMobileMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (page === 'preview' || page === 'login' || page === 'merge-edit' || page === 'library-upload')
      return;
    document.title =
      page === 'merge'
        ? t('pages.mergeTitle')
        : page === 'playlists'
          ? t('pages.playlistsTitle')
          : page === 'admin'
            ? t('pages.adminTitle')
            : t('pages.libraryTitle');
  }, [page, t]);

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
            <span className="nav-brand-name">{t('app.name')}</span>
            <span className="nav-brand-tagline">{t('app.tagline')}</span>
          </div>

          <div className="nav-center nav-center-desktop">
            <PageNavTabs
              page={page}
              navigate={navigate}
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

        {mobileMenuOpen && (
          <div className="nav-mobile-menu" id="nav-mobile-menu">
            <div className="nav-mobile-menu-section">{accountActions}</div>
            <div className="nav-mobile-menu-section nav-mobile-menu-tools">
              {langToggle}
            </div>
          </div>
        )}
      </header>

      <div className="app-content">
        {page === 'library' && <LibraryPage libraryUpload={libraryUpload} />}
        {page === 'playlists' && permissions.canMerge && (
          <PlaylistsPage
            selectedId={playlistId}
            shareToken={playlistShareToken}
            onSelectId={navigateToPlaylist}
            onClearShareToken={() => navigateClearPlaylistShare(playlistId)}
            onLoadToMerge={navigateToMergeWithPlaylist}
          />
        )}
        {page === 'merge' && permissions.canMerge && (
          <MergePage mergePlaylistId={mergePlaylistId} />
        )}
        {page === 'admin' && permissions.canEdit && <AdminPage />}
      </div>

      <nav className="nav-bottom" aria-label={t('nav.pages')}>
        <PageNavTabs
          page={page}
          navigate={navigate}
          canMerge={permissions.canMerge}
          canEdit={permissions.canEdit}
          variant="bottom"
        />
      </nav>
    </div>
  );
}
