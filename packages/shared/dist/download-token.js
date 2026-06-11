import { createHmac, timingSafeEqual } from 'node:crypto';
function encodePart(s) {
    return Buffer.from(s, 'utf8').toString('base64url');
}
function decodePart(s) {
    return Buffer.from(s, 'base64url').toString('utf8');
}
export function signDownloadToken(opts) {
    const payload = `${opts.jobId}:${opts.expiresAtUnix}`;
    const sig = createHmac('sha256', opts.secret)
        .update(payload)
        .digest('base64url');
    return `${encodePart(opts.jobId)}.${opts.expiresAtUnix}.${sig}`;
}
export function verifyDownloadToken(opts) {
    const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);
    const parts = opts.token.split('.');
    if (parts.length !== 3)
        return null;
    const [jobEnc, expStr, sig] = parts;
    let jobId;
    try {
        jobId = decodePart(jobEnc);
    }
    catch {
        return null;
    }
    const expiresAtUnix = Number(expStr);
    if (!Number.isFinite(expiresAtUnix))
        return null;
    if (expiresAtUnix < now)
        return null;
    const payload = `${jobId}:${expiresAtUnix}`;
    const expected = createHmac('sha256', opts.secret)
        .update(payload)
        .digest('base64url');
    try {
        if (expected.length !== sig.length)
            return null;
        if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig)))
            return null;
    }
    catch {
        return null;
    }
    return { jobId, expiresAtUnix };
}
//# sourceMappingURL=download-token.js.map