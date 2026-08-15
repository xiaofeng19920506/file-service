import { useEffect, useState } from 'react';
import { useAppPage } from '../hooks/useAppPage';
import AdminDownloadSection from '../components/AdminDownloadSection';
import AdminUserSection from '../components/AdminUserSection';
import { useAuth } from '../auth/AuthContext';
import { homePageForPermissions } from '../lib/permissions';
import { useI18n } from '../i18n';

type AdminSection = 'downloads' | 'users';

export default function AdminPage() {
  const { t } = useI18n();
  const { permissions } = useAuth();
  const { navigate } = useAppPage();
  const [section, setSection] = useState<AdminSection>('downloads');

  useEffect(() => {
    if (!permissions.canEdit) navigate(homePageForPermissions(permissions));
  }, [permissions, navigate]);

  if (!permissions.canEdit) return null;

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <h1>{t('admin.title')}</h1>
      </div>
      <div className="admin-tabs page-tabs" role="tablist" aria-label={t('admin.tabs')}>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'downloads'}
          className={`page-tab${section === 'downloads' ? ' active' : ''}`}
          onClick={() => setSection('downloads')}
        >
          {t('admin.tabDownloads')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'users'}
          className={`page-tab${section === 'users' ? ' active' : ''}`}
          onClick={() => setSection('users')}
        >
          {t('admin.tabUsers')}
        </button>
      </div>
      {section === 'downloads' ? <AdminDownloadSection /> : <AdminUserSection />}
    </main>
  );
}
