import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'bulletin-section';

/** 允许牧师邀请链接的分区（message=PPT 上传；verse_of_week=填写金句） */
export const BULLETIN_SECTION_INVITE_ALLOWED = new Set(['message', 'verse_of_week']);

function encodePart(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function decodePart(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function signBulletinSectionInviteToken(opts: {
  secret: string;
  bulletinId: string;
  sectionId: string;
  expiresAtUnix: number;
}): string {
  const payload = `${PREFIX}:${opts.bulletinId}:${opts.sectionId}:${opts.expiresAtUnix}`;
  const sig = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  return `bs.${encodePart(opts.bulletinId)}.${encodePart(opts.sectionId)}.${opts.expiresAtUnix}.${sig}`;
}

export function verifyBulletinSectionInviteToken(opts: {
  secret: string;
  token: string;
  nowUnix?: number;
}): { bulletinId: string; sectionId: string; expiresAtUnix: number } | null {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const parts = opts.token.split('.');
  if (parts.length !== 5 || parts[0] !== 'bs') return null;
  const [, bulletinEnc, sectionEnc, expStr, sig] = parts;
  let bulletinId: string;
  let sectionId: string;
  try {
    bulletinId = decodePart(bulletinEnc!);
    sectionId = decodePart(sectionEnc!);
  } catch {
    return null;
  }
  const expiresAtUnix = Number(expStr);
  if (!Number.isFinite(expiresAtUnix) || expiresAtUnix < now) return null;
  if (!BULLETIN_SECTION_INVITE_ALLOWED.has(sectionId)) return null;
  const payload = `${PREFIX}:${bulletinId}:${sectionId}:${expiresAtUnix}`;
  const expected = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  try {
    if (!sig || expected.length !== sig.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return { bulletinId, sectionId, expiresAtUnix };
}
