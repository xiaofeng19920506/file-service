import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'playlist-edit';

function encodePart(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function decodePart(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function signPlaylistEditToken(opts: {
  secret: string;
  playlistId: string;
  bulletinId: string;
  expiresAtUnix: number;
}): string {
  const payload = `${PREFIX}:${opts.playlistId}:${opts.bulletinId}:${opts.expiresAtUnix}`;
  const sig = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  return `pe.${encodePart(opts.playlistId)}.${encodePart(opts.bulletinId)}.${opts.expiresAtUnix}.${sig}`;
}

export function verifyPlaylistEditToken(opts: {
  secret: string;
  token: string;
  nowUnix?: number;
}): { playlistId: string; bulletinId: string; expiresAtUnix: number } | null {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const parts = opts.token.split('.');
  if (parts.length !== 5 || parts[0] !== 'pe') return null;
  const [, playlistEnc, bulletinEnc, expStr, sig] = parts;
  let playlistId: string;
  let bulletinId: string;
  try {
    playlistId = decodePart(playlistEnc!);
    bulletinId = decodePart(bulletinEnc!);
  } catch {
    return null;
  }
  const expiresAtUnix = Number(expStr);
  if (!Number.isFinite(expiresAtUnix) || expiresAtUnix < now) return null;
  const payload = `${PREFIX}:${playlistId}:${bulletinId}:${expiresAtUnix}`;
  const expected = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  try {
    if (!sig || expected.length !== sig.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return { playlistId, bulletinId, expiresAtUnix };
}
