import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'playlist-share';

function encodePart(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function decodePart(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function signPlaylistShareToken(opts: {
  secret: string;
  playlistId: string;
  expiresAtUnix: number;
}): string {
  const payload = `${PREFIX}:${opts.playlistId}:${opts.expiresAtUnix}`;
  const sig = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  return `ps.${encodePart(opts.playlistId)}.${opts.expiresAtUnix}.${sig}`;
}

export function verifyPlaylistShareToken(opts: {
  secret: string;
  token: string;
  nowUnix?: number;
}): { playlistId: string; expiresAtUnix: number } | null {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const parts = opts.token.split('.');
  if (parts.length !== 4 || parts[0] !== 'ps') return null;
  const [, playlistEnc, expStr, sig] = parts;
  let playlistId: string;
  try {
    playlistId = decodePart(playlistEnc!);
  } catch {
    return null;
  }
  const expiresAtUnix = Number(expStr);
  if (!Number.isFinite(expiresAtUnix) || expiresAtUnix < now) return null;
  const payload = `${PREFIX}:${playlistId}:${expiresAtUnix}`;
  const expected = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  try {
    if (!sig || expected.length !== sig.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return { playlistId, expiresAtUnix };
}
