import { createHmac, timingSafeEqual } from 'node:crypto';

function encodePart(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function decodePart(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function signAudioStreamToken(opts: {
  secret: string;
  videoId: string;
  expiresAtUnix: number;
}): string {
  const payload = `${opts.videoId}:${opts.expiresAtUnix}`;
  const sig = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  return `${encodePart(opts.videoId)}.${opts.expiresAtUnix}.${sig}`;
}

export function verifyAudioStreamToken(opts: {
  secret: string;
  token: string;
  nowUnix?: number;
}): { videoId: string; expiresAtUnix: number } | null {
  const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
  const parts = opts.token.split('.');
  if (parts.length !== 3) return null;
  const [videoEnc, expStr, sig] = parts;
  let videoId: string;
  try {
    videoId = decodePart(videoEnc);
  } catch {
    return null;
  }
  const expiresAtUnix = Number(expStr);
  if (!Number.isFinite(expiresAtUnix) || expiresAtUnix < now) return null;
  const payload = `${videoId}:${expiresAtUnix}`;
  const expected = createHmac('sha256', opts.secret).update(payload).digest('base64url');
  try {
    if (expected.length !== sig.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return { videoId, expiresAtUnix };
}
