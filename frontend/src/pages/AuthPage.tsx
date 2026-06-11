import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type AuthMode = 'login' | 'register';

function isRegisterNameValid(firstName: string, lastName: string): boolean {
  return firstName.trim().length >= 1 && lastName.trim().length >= 1;
}

export default function AuthPage() {
  const { t } = useI18n();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, firstName.trim(), lastName.trim());
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'login_failed', t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <h1>{t('app.name')}</h1>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            {t('auth.loginTab')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
          >
            {t('auth.registerTab')}
          </button>
        </div>

        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          {mode === 'register' && (
            <div className="auth-name-row">
              <label className="metadata-field">
                <span>{t('auth.firstName')}</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  placeholder={t('auth.firstNamePlaceholder')}
                  required
                  minLength={1}
                />
              </label>
              <label className="metadata-field">
                <span>{t('auth.lastName')}</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  placeholder={t('auth.lastNamePlaceholder')}
                  required
                  minLength={1}
                />
              </label>
            </div>
          )}
          <label className="metadata-field">
            <span>{t('auth.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              required
            />
          </label>
          <label className="metadata-field">
            <span>{t('auth.password')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={t('auth.passwordPlaceholder')}
              required
              minLength={8}
            />
          </label>

          {error && <p className="error-msg">{error}</p>}

          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={
              submitting ||
              !email.trim() ||
              password.length < 8 ||
              (mode === 'register' && !isRegisterNameValid(firstName, lastName))
            }
          >
            {submitting
              ? t('auth.submitting')
              : mode === 'login'
                ? t('auth.login')
                : t('auth.register')}
          </button>
        </form>

        <p className="auth-guest-link">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              window.location.hash = '#/library';
            }}
          >
            {t('auth.continueAsGuest')}
          </button>
        </p>
      </section>
    </div>
  );
}
