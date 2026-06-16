import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'ytoauth';
const DEFAULT_TTL_SECONDS = 600;

export type YoutubeOAuthState = {
  userId: string;
  returnPlaylistId?: string;
  returnWebAppUrl?: string;
  /** e.g. `/bulletin` — OAuth 完成后回到 `#/bulletin?...` */
  returnHash?: string;
  expiresAtUnix: number;
};

function encodePart(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodePart(value: string): string | null {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function signYoutubeOAuthState(opts: {
  secret: string;
  userId: string;
  returnPlaylistId?: string;
  returnWebAppUrl?: string;
  returnHash?: string;
  expiresAtUnix?: number;
}): string {
  const expiresAtUnix = opts.expiresAtUnix ?? Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS;
  const playlistId = opts.returnPlaylistId ?? '';
  const returnWebAppUrl = opts.returnWebAppUrl ?? '';
  const returnHash = opts.returnHash ?? '';
  const playlistEnc = encodePart(playlistId);
  const webAppEnc = encodePart(returnWebAppUrl);
  const returnHashEnc = encodePart(returnHash);
  const payload = `${PREFIX}:${opts.userId}:${playlistId}:${returnWebAppUrl}:${returnHash}:${expiresAtUnix}`;
  const sig = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  return `${PREFIX}.${opts.userId}.${playlistEnc}.${webAppEnc}.${returnHashEnc}.${expiresAtUnix}.${sig}`;
}

export function verifyYoutubeOAuthState(opts: {
  secret: string;
  token: string;
  nowUnix?: number;
}): YoutubeOAuthState | null {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const parts = opts.token.split('.');
  if (parts[0] !== PREFIX) return null;

  if (parts.length === 5) {
    const [, userId, playlistEnc, expStr, sig] = parts;
    const expiresAtUnix = Number(expStr);
    if (!userId || !Number.isFinite(expiresAtUnix) || expiresAtUnix < now) return null;
    const returnPlaylistId = decodePart(playlistEnc);
    if (returnPlaylistId === null) return null;
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

  if (parts.length === 6) {
    const [, userId, playlistEnc, webAppEnc, expStr, sig] = parts;
    const expiresAtUnix = Number(expStr);
    if (!userId || !Number.isFinite(expiresAtUnix) || expiresAtUnix < now) return null;

    const returnPlaylistId = decodePart(playlistEnc);
    const returnWebAppUrl = decodePart(webAppEnc);
    if (returnPlaylistId === null || returnWebAppUrl === null) return null;

    const payload = `${PREFIX}:${userId}:${returnPlaylistId}:${returnWebAppUrl}:${expiresAtUnix}`;
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
      returnWebAppUrl: returnWebAppUrl || undefined,
      expiresAtUnix,
    };
  }

  if (parts.length !== 7) return null;
  const [, userId, playlistEnc, webAppEnc, returnHashEnc, expStr, sig] = parts;
  const expiresAtUnix = Number(expStr);
  if (!userId || !Number.isFinite(expiresAtUnix) || expiresAtUnix < now) return null;

  const returnPlaylistId = decodePart(playlistEnc);
  const returnWebAppUrl = decodePart(webAppEnc);
  const returnHash = decodePart(returnHashEnc);
  if (returnPlaylistId === null || returnWebAppUrl === null || returnHash === null) return null;

  const payload = `${PREFIX}:${userId}:${returnPlaylistId}:${returnWebAppUrl}:${returnHash}:${expiresAtUnix}`;
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
    returnWebAppUrl: returnWebAppUrl || undefined,
    returnHash: returnHash || undefined,
    expiresAtUnix,
  };
}
