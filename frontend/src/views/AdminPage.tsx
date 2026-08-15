import { useEffect } from 'react';
import { useAppPage } from '../hooks/useAppPage';
import AdminDownloadSection from '../components/AdminDownloadSection';
import AdminUserSection from '../components/AdminUserSection';
import { useAuth } from '../auth/AuthContext';
import { homePageForPermissions } from '../lib/permissions';
import { useI18n } from '../i18n';

export default function AdminPage() {
  const { t } = useI18n();
  const { permissions } = useAuth();
  const { navigate } = useAppPage();

  useEffect(() => {
    if (!permissions.canEdit) navigate(homePageForPermissions(permissions));
  }, [permissions, navigate]);

  if (!permissions.canEdit) return null;

  return (
    <main className="admin-page">
      <div className="admin-toolbar">
        <h1>{t('admin.title')}</h1>
      </div>
      <AdminDownloadSection />
      <AdminUserSection />
    </main>
  );
}
