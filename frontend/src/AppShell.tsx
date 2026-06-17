import { useLayoutEffect } from 'react';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import AppErrorBoundary from './components/AppErrorBoundary';
import { I18nProvider } from './i18n';
import { dismissAppBoot } from './lib/app-boot';

export function AppShell() {
  useLayoutEffect(() => {
    dismissAppBoot();
  }, []);

  return (
    <I18nProvider>
      <AuthProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </AuthProvider>
    </I18nProvider>
  );
}
