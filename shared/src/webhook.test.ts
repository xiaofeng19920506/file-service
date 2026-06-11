import { describe, it, expect } from 'vitest';
import { signWebhookBody, verifyWebhookSignature } from './webhook.js';

describe('webhook signing', () => {
  const secret = 'test-secret-key';
  const body = '{"event":"job.succeeded"}';

  it('signs and verifies', () => {
    const sig = signWebhookBody(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('rejects wrong signature', () => {
    expect(verifyWebhookSignature(body, 'bad', secret)).toBe(false);
  });
});
