import { useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import BlobPreviewPage from './pages/BlobPreviewPage';
import MergeEditPage from './pages/MergeEditPage';
import AdminPage from './pages/AdminPage';
import AuthPage from './pages/AuthPage';
import LibraryPage from './pages/LibraryPage';
import MergePage from './pages/MergePage';
import PlaylistsPage from './pages/PlaylistsPage';
import UploadConfirmPage from './pages/UploadConfirmPage';
import { useLibraryUpload } from './hooks/useLibraryUpload';
import { MoonIcon, SunIcon } from './components/icons';
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

  return (
    <div className={`app${page === 'playlists' ? ' app-playlists' : ''}`}>
      <nav className="nav">
        <div className="nav-inner">
        <div className="nav-brand">
          <span className="nav-brand-name">{t('app.name')}</span>
          <span className="nav-brand-tagline">{t('app.tagline')}</span>
        </div>

        <div className="nav-center">
          <div className="page-tabs" role="tablist" aria-label={t('nav.pages')}>
            <button
              type="button"
              role="tab"
              aria-selected={page === 'library'}
              className={`page-tab${page === 'library' ? ' active' : ''}`}
              onClick={() => navigate('library')}
            >
              {t('nav.library')}
            </button>
            {permissions.canMerge && (
              <>
                <button
                  type="button"
                  role="tab"
                  aria-selected={page === 'playlists'}
                  className={`page-tab${page === 'playlists' ? ' active' : ''}`}
                  onClick={() => navigate('playlists')}
                >
                  {t('nav.playlists')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={page === 'merge'}
                  className={`page-tab${page === 'merge' ? ' active' : ''}`}
                  onClick={() => navigate('merge')}
                >
                  {t('nav.merge')}
                </button>
              </>
            )}
            {permissions.canEdit && (
              <button
                type="button"
                role="tab"
                aria-selected={page === 'admin'}
                className={`page-tab${page === 'admin' ? ' active' : ''}`}
                onClick={() => navigate('admin')}
              >
                {t('nav.admin')}
              </button>
            )}
          </div>
        </div>

        <div className="nav-actions">
          {user ? (
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
          )}
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
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        </div>
      </nav>

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
  );
}
