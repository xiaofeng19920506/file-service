import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'ytoauth';
const DEFAULT_TTL_SECONDS = 600;

export type YoutubeOAuthState = {
  userId: string;
  returnPlaylistId?: string;
  expiresAtUnix: number;
};

export function signYoutubeOAuthState(opts: {
  secret: string;
  userId: string;
  returnPlaylistId?: string;
  expiresAtUnix?: number;
}): string {
  const expiresAtUnix = opts.expiresAtUnix ?? Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS;
  const playlistId = opts.returnPlaylistId ?? '';
  const playlistEnc = Buffer.from(playlistId, 'utf8').toString('base64url');
  const payload = `${PREFIX}:${opts.userId}:${playlistId}:${expiresAtUnix}`;
  const sig = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  return `${PREFIX}.${opts.userId}.${playlistEnc}.${expiresAtUnix}.${sig}`;
}

export function verifyYoutubeOAuthState(opts: {
  secret: string;
  token: string;
  nowUnix?: number;
}): YoutubeOAuthState | null {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const parts = opts.token.split('.');
  if (parts.length !== 5 || parts[0] !== PREFIX) return null;
  const [, userId, playlistEnc, expStr, sig] = parts;
  const expiresAtUnix = Number(expStr);
  if (!userId || !Number.isFinite(expiresAtUnix)) return null;
  if (expiresAtUnix < now) return null;

  let returnPlaylistId = '';
  try {
    returnPlaylistId = Buffer.from(playlistEnc, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const payload = `${PREFIX}:${userId}:${returnPlaylistId}:${expiresAtUnix}`;
  const expected = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  try {
    if (expected.length !== sig.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }

  return {
    userId,
    returnPlaylistId: returnPlaylistId || undefined,
    expiresAtUnix,
  };
}
