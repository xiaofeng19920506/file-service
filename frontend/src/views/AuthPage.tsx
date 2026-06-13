import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { friendlyError } from '../lib/error-messages';
import { useI18n } from '../i18n';

type AuthMode = 'login' | 'register';

function isRegisterNameValid(firstName: string, lastName: string): boolean {
  return firstName.trim().length >= 1 && lastName.trim().length >= 1;
}

function isRegisterContactValid(input: {
  phone: string;
  addressLine1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
}): boolean {
  return (
    input.phone.replace(/\D/g, '').length >= 7 &&
    input.addressLine1.trim().length >= 3 &&
    input.city.trim().length >= 2 &&
    input.stateProvince.trim().length >= 2 &&
    input.postalCode.trim().length >= 3
  );
}

export default function AuthPage() {
  const { t } = useI18n();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
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
        await register({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim(),
          city: city.trim(),
          stateProvince: stateProvince.trim(),
          postalCode: postalCode.trim(),
          country: country.trim(),
        });
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'login_failed', t));
    } finally {
      setSubmitting(false);
    }
  };

  const registerValid =
    isRegisterNameValid(firstName, lastName) &&
    isRegisterContactValid({ phone, addressLine1, city, stateProvince, postalCode });

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
            <>
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
              <label className="metadata-field">
                <span>{t('auth.phone')}</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder={t('auth.phonePlaceholder')}
                  required
                />
              </label>
              <label className="metadata-field">
                <span>{t('auth.addressLine1')}</span>
                <input
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  autoComplete="address-line1"
                  placeholder={t('auth.addressLine1Placeholder')}
                  required
                />
              </label>
              <label className="metadata-field">
                <span>{t('auth.addressLine2')}</span>
                <input
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  autoComplete="address-line2"
                  placeholder={t('auth.addressLine2Placeholder')}
                />
              </label>
              <div className="auth-name-row">
                <label className="metadata-field">
                  <span>{t('auth.city')}</span>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    autoComplete="address-level2"
                    placeholder={t('auth.cityPlaceholder')}
                    required
                  />
                </label>
                <label className="metadata-field">
                  <span>{t('auth.stateProvince')}</span>
                  <input
                    type="text"
                    value={stateProvince}
                    onChange={(e) => setStateProvince(e.target.value)}
                    autoComplete="address-level1"
                    placeholder={t('auth.stateProvincePlaceholder')}
                    required
                  />
                </label>
              </div>
              <div className="auth-name-row">
                <label className="metadata-field">
                  <span>{t('auth.postalCode')}</span>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    autoComplete="postal-code"
                    placeholder={t('auth.postalCodePlaceholder')}
                    required
                  />
                </label>
                <label className="metadata-field">
                  <span>{t('auth.country')}</span>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    autoComplete="country-name"
                    placeholder={t('auth.countryPlaceholder')}
                  />
                </label>
              </div>
            </>
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
              (mode === 'register' && !registerValid)
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
              window.location.hash = '#/playlists';
            }}
          >
            {t('auth.continueAsGuest')}
          </button>
        </p>
      </section>
    </div>
  );
}
