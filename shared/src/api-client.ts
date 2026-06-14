/** Web 前端（Vite / Next）在请求头携带此值 */
export const CLIENT_ID_WEB = 'file-service-web';

/** iOS / Android Playlist Player */
export const CLIENT_ID_MOBILE = 'playlist-player';

/** 旧版 App 客户端标识（兼容） */
export const CLIENT_ID_MOBILE_LEGACY = 'worship-player';

export type ApiClientKind = 'web' | 'mobile' | 'unknown';

const MOBILE_CLIENT_IDS = new Set([CLIENT_ID_MOBILE, CLIENT_ID_MOBILE_LEGACY]);

export function readRequestClientId(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | null {
  if (!headers) return null;
  const raw = headers['x-client'] ?? headers['X-Client'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function resolveApiClientKind(clientId: string | null | undefined): ApiClientKind {
  if (!clientId) return 'unknown';
  if (clientId === CLIENT_ID_WEB) return 'web';
  if (MOBILE_CLIENT_IDS.has(clientId)) return 'mobile';
  return 'unknown';
}

export function isMobileAppClient(clientId: string | null | undefined): boolean {
  return resolveApiClientKind(clientId) === 'mobile';
}

/** 未带 X-Client 的请求按 Web 处理（兼容旧客户端与直接 API 调用） */
export function isWebAppClient(clientId: string | null | undefined): boolean {
  const kind = resolveApiClientKind(clientId);
  return kind === 'web' || kind === 'unknown';
}

/** 订阅已移除，所有客户端均免费开放 */
export function requiresPremiumSubscription(_clientId: string | null | undefined): boolean {
  return false;
}
