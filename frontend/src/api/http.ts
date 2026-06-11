import { getAuthToken } from '../lib/auth-session';

const base = process.env.NEXT_PUBLIC_API_URL ?? '';
const apiKey = process.env.NEXT_PUBLIC_API_KEY?.trim() ?? '';

function resolveBearerToken(): string | undefined {
  const userToken = getAuthToken();
  if (userToken) return userToken;
  return apiKey || undefined;
}

export function apiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const bearer = resolveBearerToken();
  if (bearer && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearer}`);
  }
  return headers;
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const headers = apiHeaders(init.headers);
  return fetch(url, { ...init, headers });
}

export async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : res.statusText;
    throw new Error(msg);
  }
  return data as T;
}
