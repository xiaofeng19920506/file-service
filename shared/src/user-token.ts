import { createHmac, timingSafeEqual } from 'node:crypto';
import type { UserRole } from './permissions.js';
import { isValidUserRole, normalizeUserRole } from './permissions.js';

const USER_TOKEN_PREFIX = 'usr';

export type UserSessionClaims = {
  userId: string;
  email: string;
  role: UserRole;
  expiresAtUnix: number;
};

export function signUserToken(opts: {
  secret: string;
  userId: string;
  email: string;
  role: UserRole;
  expiresAtUnix: number;
}): string {
  const payload = `${USER_TOKEN_PREFIX}:${opts.userId}:${opts.email}:${opts.role}:${opts.expiresAtUnix}`;
  const sig = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  const emailEnc = Buffer.from(opts.email, 'utf8').toString('base64url');
  return `${USER_TOKEN_PREFIX}.${opts.userId}.${emailEnc}.${opts.role}.${opts.expiresAtUnix}.${sig}`;
}

export function verifyUserToken(opts: {
  secret: string;
  token: string;
  nowUnix?: number;
}): UserSessionClaims | null {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const parts = opts.token.split('.');
  if (parts.length !== 6 || parts[0] !== USER_TOKEN_PREFIX) return null;
  const [, userId, emailEnc, role, expStr, sig] = parts;
  if (!isValidUserRole(role) && role !== 'user') return null;
  const normalizedRole = normalizeUserRole(role);
  const expiresAtUnix = Number(expStr);
  if (!userId || !Number.isFinite(expiresAtUnix)) return null;
  if (expiresAtUnix < now) return null;
  let email: string;
  try {
    email = Buffer.from(emailEnc, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const payload = `${USER_TOKEN_PREFIX}:${userId}:${email}:${normalizedRole}:${expiresAtUnix}`;
  const expected = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  try {
    if (expected.length !== sig.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return { userId, email, role: normalizedRole, expiresAtUnix };
}
