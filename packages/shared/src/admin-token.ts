import { createHmac, timingSafeEqual } from 'node:crypto';

const ADMIN_TOKEN_PREFIX = 'admin';

export function signAdminToken(opts: {
  secret: string;
  expiresAtUnix: number;
}): string {
  const payload = `${ADMIN_TOKEN_PREFIX}:${opts.expiresAtUnix}`;
  const sig = createHmac('sha256', opts.secret)
    .update(payload)
    .digest('base64url');
  return `${ADMIN_TOKEN_PREFIX}.${opts.expiresAtUnix}.${sig}`;
}

export function verifyAdminToken(opts: {
  secret: string;
  token: string;
  nowUnix?: number;
}): { expiresAtUnix: number } | null {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const parts = opts.token.split('.');
  if (parts.length !== 3 || parts[0] !== ADMIN_TOKEN_PREFIX) return null;
  const expiresAtUnix = Number(parts[1]);
  const sig = parts[2];
  if (!Number.isFinite(expiresAtUnix)) return null;
  if (expiresAtUnix < now) return null;
  const payload = `${ADMIN_TOKEN_PREFIX}:${expiresAtUnix}`;
  const expected = createHmac('sha256', opts.secret)
    .update(payload)
    .digest('base64url');
  try {
    if (expected.length !== sig.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return { expiresAtUnix };
}
