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
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country?: string;
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
      // 仅当服务端明确拒绝当前 token 时才清除；避免偶发网关错误误登出
      let errorCode: string | undefined;
      try {
        const body = (await res.clone().json()) as { error?: string };
        errorCode = body.error;
      } catch {
        // 无法解析响应体时保留本地会话
        return cached;
      }
      if (errorCode === 'session_invalid' || errorCode === 'unauthorized') {
        clearAuthSession();
        return null;
      }
      return cached;
    }
    if (!res.ok) {
      return cached;
    }
    const data = await parseJson<{ expiresAt: string; user: AuthUser }>(res);
    setAuthSession(token, data.expiresAt, data.user);
    return data.user;
  } catch {
    return cached ?? null;
  }
}

export function logoutUser(): void {
  clearAuthSession();
}
