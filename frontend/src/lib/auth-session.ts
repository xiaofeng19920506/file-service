import type { UserRole } from './permissions';
import { normalizeUserRole } from './permissions';
import { splitLegacyDisplayName } from './user-name';

const TOKEN_KEY = 'file-service-auth-token';
const EXPIRES_KEY = 'file-service-auth-expires';
const USER_KEY = 'file-service-auth-user';

/** Cookie 名（与 localStorage 键分开，避免特殊字符） */
const COOKIE_TOKEN = 'fs_auth_token';
const COOKIE_EXPIRES = 'fs_auth_expires';
const COOKIE_USER = 'fs_auth_user';

const COOKIE_BY_STORAGE_KEY: Record<string, string> = {
  [TOKEN_KEY]: COOKIE_TOKEN,
  [EXPIRES_KEY]: COOKIE_EXPIRES,
  [USER_KEY]: COOKIE_USER,
};

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
};

type StoredUser = Partial<AuthUser> & {
  displayName?: string;
};

function normalizeStoredUser(raw: StoredUser): AuthUser | null {
  if (!raw.id || !raw.email) return null;
  let firstName = raw.firstName?.trim() ?? '';
  let lastName = raw.lastName?.trim() ?? '';
  if (!firstName && raw.displayName) {
    const split = splitLegacyDisplayName(raw.displayName);
    firstName = split.firstName;
    lastName = split.lastName;
  }
  if (!firstName) return null;
  return {
    id: raw.id,
    email: raw.email,
    firstName,
    lastName,
    role: normalizeUserRole(raw.role),
    phone: raw.phone?.trim() ?? '',
    addressLine1: raw.addressLine1?.trim() ?? '',
    addressLine2: raw.addressLine2?.trim() ?? '',
    city: raw.city?.trim() ?? '',
    stateProvince: raw.stateProvince?.trim() ?? '',
    postalCode: raw.postalCode?.trim() ?? '',
    country: raw.country?.trim() ?? '',
  };
}

function cookieMaxAgeSec(expiresAt: string): number {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms)) return 60 * 60 * 24 * 365;
  return Math.max(0, Math.floor(ms / 1000));
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string, expiresAt: string): void {
  if (typeof document === 'undefined') return;
  const maxAge = cookieMaxAgeSec(expiresAt);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function eraseCookie(name: string): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function readStorageItem(key: string): string | null {
  let value: string | null = null;
  try {
    value = localStorage.getItem(key);
  } catch {
    // Safari 私密浏览 / 存储受限时可能抛错
  }
  if (value) return value;

  const cookieKey = COOKIE_BY_STORAGE_KEY[key];
  if (!cookieKey) return null;
  const fromCookie = readCookie(cookieKey);
  if (!fromCookie) return null;

  try {
    localStorage.setItem(key, fromCookie);
  } catch {
    // 仅 cookie 可用时仍返回已读到的值
  }
  return fromCookie;
}

function writeStorageItem(key: string, value: string, expiresAt: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage 不可用时依赖 cookie
  }
  const cookieKey = COOKIE_BY_STORAGE_KEY[key];
  if (cookieKey) {
    try {
      writeCookie(cookieKey, value, expiresAt);
    } catch {
      // ignore
    }
  }
}

function removeStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  const cookieKey = COOKIE_BY_STORAGE_KEY[key];
  if (cookieKey) eraseCookie(cookieKey);
}

function isSessionExpired(expires: string): boolean {
  const parsed = Date.parse(expires);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() >= parsed;
}

export function getAuthToken(): string | null {
  const token = readStorageItem(TOKEN_KEY);
  const expires = readStorageItem(EXPIRES_KEY);
  if (!token || !expires) return null;
  if (isSessionExpired(expires)) {
    clearAuthSession();
    return null;
  }
  return token;
}

function readStoredUser(): AuthUser | null {
  const raw = readStorageItem(USER_KEY);
  if (!raw) return null;
  try {
    return normalizeStoredUser(JSON.parse(raw) as StoredUser);
  } catch {
    return null;
  }
}

/** 本地有未过期的 token 与用户信息 */
export function hasStoredSession(): boolean {
  return Boolean(getAuthToken() && readStoredUser());
}

/** 从本地存储恢复用户（需有效 token） */
export function getCachedUser(): AuthUser | null {
  if (!getAuthToken()) return null;
  return readStoredUser();
}

export function setAuthSession(token: string, expiresAt: string, user: AuthUser): void {
  const normalized: AuthUser = { ...user, role: normalizeUserRole(user.role) };
  const userJson = JSON.stringify(normalized);
  writeStorageItem(TOKEN_KEY, token, expiresAt);
  writeStorageItem(EXPIRES_KEY, expiresAt, expiresAt);
  writeStorageItem(USER_KEY, userJson, expiresAt);
}

export function clearAuthSession(): void {
  removeStorageItem(TOKEN_KEY);
  removeStorageItem(EXPIRES_KEY);
  removeStorageItem(USER_KEY);
}
