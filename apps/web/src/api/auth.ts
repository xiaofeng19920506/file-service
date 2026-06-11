import { apiFetch, parseJson } from './http';
import {
  clearAuthSession,
  getAuthToken,
  getCachedUser,
  setAuthSession,
  type AuthUser,
} from '../lib/auth-session';

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export async function registerUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<AuthSession> {
  const res = await apiFetch('/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parseJson<AuthSession>(res);
  setAuthSession(data.token, data.expiresAt, data.user);
  return data;
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  const res = await apiFetch('/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parseJson<AuthSession>(res);
  setAuthSession(data.token, data.expiresAt, data.user);
  return data;
}

export async function verifyAuthSession(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;

  const cached = getCachedUser();

  try {
    const res = await apiFetch('/v1/auth/session');
    if (res.status === 401) {
      clearAuthSession();
      return null;
    }
    if (!res.ok) {
      return cached;
    }
    const data = await parseJson<{ expiresAt: string; user: AuthUser }>(res);
    setAuthSession(token, data.expiresAt, data.user);
    return data.user;
  } catch {
    return cached;
  }
}

export function logoutUser(): void {
  clearAuthSession();
}
