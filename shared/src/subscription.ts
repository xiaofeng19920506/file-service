import { createSign } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ApiEnv } from './env.js';
import type { Db } from './db/index.js';
import { userSubscriptions, users } from './db/schema.js';
import {
  CLIENT_ID_MOBILE,
  type ApiClientKind,
  isMobileAppClient,
  readRequestClientId,
  requiresPremiumSubscription,
  resolveApiClientKind,
} from './api-client.js';

export {
  CLIENT_ID_MOBILE,
  CLIENT_ID_MOBILE_LEGACY,
  CLIENT_ID_WEB,
  isMobileAppClient,
  isWebAppClient,
  readRequestClientId,
  requiresPremiumSubscription,
  resolveApiClientKind,
  type ApiClientKind,
} from './api-client.js';

/** @deprecated Use isMobileAppClient */
export const CLIENT_ID_PLAYLIST_PLAYER = CLIENT_ID_MOBILE;

/** @deprecated Use isMobileAppClient */
export function isPlaylistPlayerAppClient(clientId: string | null | undefined): boolean {
  return isMobileAppClient(clientId);
}

export const DEFAULT_PREMIUM_PRODUCT_ID = 'com.fileservice.playlistplayer.premium.monthly';

export type SubscriptionStatus = {
  active: boolean;
  productId: string | null;
  expiresAt: string | null;
  environment: 'sandbox' | 'production' | null;
  source: 'subscription' | 'trial' | null;
  trialExpiresAt: string | null;
};

/** 按客户端补充订阅语义，供 Web / 手机 App 共用同一套 API */
export type ClientSubscriptionStatus = SubscriptionStatus & {
  client: ApiClientKind;
  /** 当前客户端是否要求 Premium 订阅才能使用付费功能 */
  premiumRequired: boolean;
  /** 当前客户端下用户是否可以使用 Premium 功能 */
  effectivePremium: boolean;
};

export type VerifiedAppleSubscription = {
  productId: string;
  originalTransactionId: string;
  expiresAt: Date | null;
  environment: 'sandbox' | 'production';
};

function parseAllowedProductIds(env: ApiEnv): string[] {
  const raw = env.SUBSCRIPTION_IAP_PRODUCT_IDS?.trim();
  if (raw) {
    return raw.split(',').map((id) => id.trim()).filter(Boolean);
  }
  return [DEFAULT_PREMIUM_PRODUCT_ID];
}

function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('invalid_jws');
  return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

function normalizePrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function createAppleApiJwt(env: ApiEnv): string {
  const issuerId = env.APPLE_IAP_ISSUER_ID?.trim();
  const keyId = env.APPLE_IAP_KEY_ID?.trim();
  const privateKey = env.APPLE_IAP_PRIVATE_KEY?.trim();
  const bundleId = env.APPLE_BUNDLE_ID?.trim() || 'com.fileservice.playlistplayer';
  if (!issuerId || !keyId || !privateKey) {
    throw new Error('iap_not_configured');
  }

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: 'appstoreconnect-v1',
    bid: bundleId,
  };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const sign = createSign('SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(normalizePrivateKey(privateKey), 'base64url');
  return `${signingInput}.${signature}`;
}

function appleApiBase(env: ApiEnv): string {
  return env.APPLE_IAP_ENVIRONMENT === 'production'
    ? 'https://api.storekit.itunes.apple.com'
    : 'https://api.storekit-sandbox.itunes.apple.com';
}

function parseAppleTransactionPayload(
  payload: Record<string, unknown>,
  env: ApiEnv,
): VerifiedAppleSubscription {
  const bundleId = env.APPLE_BUNDLE_ID?.trim() || 'com.fileservice.playlistplayer';
  const allowed = new Set(parseAllowedProductIds(env));

  const productId = String(payload.productId ?? '');
  const originalTransactionId = String(payload.originalTransactionId ?? payload.transactionId ?? '');
  const payloadBundleId = String(payload.bundleId ?? '');

  if (!productId || !originalTransactionId) throw new Error('invalid_apple_transaction');
  if (payloadBundleId && payloadBundleId !== bundleId) throw new Error('invalid_bundle_id');
  if (!allowed.has(productId)) throw new Error('invalid_product_id');

  const expiresMs = payload.expiresDate ? Number(payload.expiresDate) : NaN;
  const expiresAt = Number.isFinite(expiresMs) ? new Date(expiresMs) : null;

  return {
    productId,
    originalTransactionId,
    expiresAt,
    environment: env.APPLE_IAP_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  };
}

export async function verifyAppleTransaction(
  env: ApiEnv,
  transactionId: string,
): Promise<VerifiedAppleSubscription> {
  const trimmed = transactionId.trim();
  if (!trimmed) throw new Error('invalid_transaction');

  if (env.SUBSCRIPTION_DEV_MODE === true && !env.APPLE_IAP_KEY_ID) {
    return {
      productId: DEFAULT_PREMIUM_PRODUCT_ID,
      originalTransactionId: `dev-${trimmed}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      environment: 'sandbox',
    };
  }

  const jwt = createAppleApiJwt(env);
  const res = await fetch(`${appleApiBase(env)}/inApps/v1/transactions/${encodeURIComponent(trimmed)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (!res.ok) {
    throw new Error(res.status === 404 ? 'invalid_transaction' : 'iap_verify_failed');
  }

  const body = (await res.json()) as { signedTransactionInfo?: string };
  if (!body.signedTransactionInfo) throw new Error('invalid_apple_transaction');
  const payload = decodeJwsPayload(body.signedTransactionInfo);
  return parseAppleTransactionPayload(payload, env);
}

export async function upsertUserSubscription(
  db: Db,
  userId: string,
  verified: VerifiedAppleSubscription,
): Promise<void> {
  const now = new Date();
  await db
    .insert(userSubscriptions)
    .values({
      userId,
      provider: 'apple',
      productId: verified.productId,
      originalTransactionId: verified.originalTransactionId,
      expiresAt: verified.expiresAt,
      environment: verified.environment,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userSubscriptions.userId,
      set: {
        productId: verified.productId,
        originalTransactionId: verified.originalTransactionId,
        expiresAt: verified.expiresAt,
        environment: verified.environment,
        updatedAt: now,
      },
    });
}

export function computeRegistrationTrialEndsAt(env: ApiEnv, now = new Date()): Date | null {
  const days = env.REGISTRATION_TRIAL_DAYS;
  if (days <= 0) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function getSubscriptionStatusForUser(
  db: Db,
  userId: string,
): Promise<SubscriptionStatus> {
  const [userRow] = await db
    .select({ premiumTrialEndsAt: users.premiumTrialEndsAt })
    .from(users)
    .where(eq(users.id, userId));

  const trialExpiresAt = userRow?.premiumTrialEndsAt?.toISOString() ?? null;

  const [row] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId));

  if (row) {
    const subExpiresAt = row.expiresAt?.toISOString() ?? null;
    const subActive = !row.expiresAt || row.expiresAt.getTime() > Date.now();
    if (subActive) {
      return {
        active: true,
        productId: row.productId,
        expiresAt: subExpiresAt,
        environment: row.environment === 'production' ? 'production' : 'sandbox',
        source: 'subscription',
        trialExpiresAt,
      };
    }
  }

  const trialActive =
    !!userRow?.premiumTrialEndsAt && userRow.premiumTrialEndsAt.getTime() > Date.now();
  if (trialActive) {
    return {
      active: true,
      productId: null,
      expiresAt: trialExpiresAt,
      environment: null,
      source: 'trial',
      trialExpiresAt,
    };
  }

  return {
    active: false,
    productId: row?.productId ?? null,
    expiresAt: row?.expiresAt?.toISOString() ?? null,
    environment: row
      ? row.environment === 'production'
        ? 'production'
        : 'sandbox'
      : null,
    source: null,
    trialExpiresAt,
  };
}

export async function isUserPremium(db: Db, userId: string): Promise<boolean> {
  const status = await getSubscriptionStatusForUser(db, userId);
  return status.active;
}

export function enrichSubscriptionStatus(
  status: SubscriptionStatus,
  clientId: string | null | undefined,
): ClientSubscriptionStatus {
  const client = resolveApiClientKind(clientId);
  const premiumRequired = requiresPremiumSubscription(clientId);
  const effectivePremium = premiumRequired ? status.active : true;
  return { ...status, client, premiumRequired, effectivePremium };
}

export async function getSubscriptionStatusForClient(
  db: Db,
  userId: string,
  clientId: string | null | undefined,
): Promise<ClientSubscriptionStatus> {
  const status = await getSubscriptionStatusForUser(db, userId);
  return enrichSubscriptionStatus(status, clientId);
}

/** Web 不受订阅限制；手机 App 需 Premium 或试用 */
export async function canAccessPremiumPlayback(
  db: Db,
  userId: string,
  clientId: string | null | undefined,
): Promise<boolean> {
  if (!requiresPremiumSubscription(clientId)) return true;
  return isUserPremium(db, userId);
}

export async function assertPremiumPlaybackAccess(
  db: Db,
  userId: string,
  headers: Record<string, string | string[] | undefined> | undefined,
): Promise<{ ok: true } | { ok: false; error: 'subscription_required' }> {
  const clientId = readRequestClientId(headers);
  if (await canAccessPremiumPlayback(db, userId, clientId)) return { ok: true };
  return { ok: false, error: 'subscription_required' };
}

export async function grantReviewSubscription(
  db: Db,
  userId: string,
  productId = DEFAULT_PREMIUM_PRODUCT_ID,
): Promise<void> {
  await upsertUserSubscription(db, userId, {
    productId,
    originalTransactionId: `review-${userId}`,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    environment: 'sandbox',
  });
}
