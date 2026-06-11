import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { I18nProvider } from './i18n';

export function AppShell() {
  return (
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  );
}
