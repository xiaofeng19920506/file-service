import { createHmac, timingSafeEqual } from 'node:crypto';
export function signWebhookBody(body, secret) {
    return createHmac('sha256', secret).update(body).digest('hex');
}
export function verifyWebhookSignature(body, signature, secret) {
    if (!signature?.trim())
        return false;
    const expected = signWebhookBody(body, secret);
    if (expected.length !== signature.length)
        return false;
    try {
        return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    }
    catch {
        return false;
    }
}
/** POST JSON 到 webhook URL；可选 HMAC 签名 */
export async function dispatchJobWebhook(url, payload, secret) {
    const body = JSON.stringify(payload);
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'file-service-webhook/1.0',
    };
    if (secret?.trim()) {
        headers['X-Webhook-Signature'] = signWebhookBody(body, secret.trim());
    }
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
        throw new Error(`webhook_http_${res.status}`);
    }
}
//# sourceMappingURL=webhook.js.map