import {
  CLIENT_ID_MOBILE,
  isMobileAppClient,
  type ApiClientKind,
  resolveApiClientKind,
} from './api-client.js';

export {
  CLIENT_ID_MOBILE,
  CLIENT_ID_MOBILE_LEGACY,
  CLIENT_ID_WEB,
  isMobileAppClient,
  isWebAppClient,
  readRequestClientId,
  resolveApiClientKind,
  type ApiClientKind,
} from './api-client.js';

/** @deprecated Use isMobileAppClient */
export const CLIENT_ID_PLAYLIST_PLAYER = CLIENT_ID_MOBILE;

/** @deprecated Use isMobileAppClient */
export function isPlaylistPlayerAppClient(clientId: string | null | undefined): boolean {
  return isMobileAppClient(clientId);
}

/** 保留类型供旧客户端解析；功能已全部免费开放 */
export type SubscriptionStatus = {
  active: boolean;
  productId: string | null;
  expiresAt: string | null;
  environment: 'sandbox' | 'production' | null;
  source: null;
  trialExpiresAt: string | null;
};

export type ClientSubscriptionStatus = SubscriptionStatus & {
  client: ApiClientKind;
  premiumRequired: false;
  effectivePremium: true;
};

const FREE_STATUS: SubscriptionStatus = {
  active: true,
  productId: null,
  expiresAt: null,
  environment: null,
  source: null,
  trialExpiresAt: null,
};

export async function getSubscriptionStatusForClient(
  _db: unknown,
  _userId: string,
  clientId: string | null | undefined,
): Promise<ClientSubscriptionStatus> {
  return {
    ...FREE_STATUS,
    client: resolveApiClientKind(clientId),
    premiumRequired: false,
    effectivePremium: true,
  };
}

export async function canAccessPremiumPlayback(
  _db: unknown,
  _userId: string,
  _clientId: string | null | undefined,
): Promise<boolean> {
  return true;
}

export async function assertPremiumPlaybackAccess(
  _db: unknown,
  _userId: string,
  _headers: Record<string, string | string[] | undefined> | undefined,
): Promise<{ ok: true }> {
  return { ok: true };
}
