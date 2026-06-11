import type { UserRole } from './permissions';
import { normalizeUserRole } from './permissions';
import { splitLegacyDisplayName } from './user-name';

const TOKEN_KEY = 'file-service-auth-token';
const EXPIRES_KEY = 'file-service-auth-expires';
const USER_KEY = 'file-service-auth-user';

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
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
  };
}

export function getAuthToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expires = localStorage.getItem(EXPIRES_KEY);
  if (!token || !expires) return null;
  if (Date.now() >= Date.parse(expires)) {
    clearAuthSession();
    return null;
  }
  return token;
}

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return normalizeStoredUser(JSON.parse(raw) as StoredUser);
  } catch {
    return null;
  }
}

/** localStorage 中有未过期的 token 与用户信息 */
export function hasStoredSession(): boolean {
  return Boolean(getAuthToken() && readStoredUser());
}

/** 从 localStorage 恢复用户（需有效 token） */
export function getCachedUser(): AuthUser | null {
  if (!getAuthToken()) return null;
  return readStoredUser();
}

export function setAuthSession(token: string, expiresAt: string, user: AuthUser): void {
  const normalized: AuthUser = { ...user, role: normalizeUserRole(user.role) };
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRES_KEY, expiresAt);
  localStorage.setItem(USER_KEY, JSON.stringify(normalized));
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(USER_KEY);
}
