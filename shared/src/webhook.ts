import { createHmac, timingSafeEqual } from 'node:crypto';

export type JobWebhookEvent = 'job.succeeded' | 'job.failed';

export type JobWebhookPayload = {
  event: JobWebhookEvent;
  jobId: string;
  status: 'succeeded' | 'failed';
  progress: number;
  errorCode?: string | null;
  errorDetail?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
};

export function signWebhookBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyWebhookSignature(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature?.trim()) return false;
  const expected = signWebhookBody(body, secret);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** POST JSON 到 webhook URL；可选 HMAC 签名 */
export async function dispatchJobWebhook(
  url: string,
  payload: JobWebhookPayload,
  secret?: string,
): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
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
