import { describe, it, expect } from 'vitest';
import {
  loadApiKeyConfig,
  extractApiKeyFromHeaders,
  verifyApiKey,
  isPublicApiPath,
} from './api-key.js';

describe('loadApiKeyConfig', () => {
  it('disables auth when API_KEY is empty', () => {
    expect(loadApiKeyConfig(undefined).required).toBe(false);
    expect(loadApiKeyConfig('  ').required).toBe(false);
  });

  it('enables auth when API_KEY is set', () => {
    const cfg = loadApiKeyConfig('secret-key-12345678');
    expect(cfg.required).toBe(true);
    expect(cfg.key).toBe('secret-key-12345678');
  });
});

describe('extractApiKeyFromHeaders', () => {
  it('reads Bearer token', () => {
    expect(
      extractApiKeyFromHeaders({ authorization: 'Bearer my-token' }),
    ).toBe('my-token');
  });

  it('reads X-API-Key header', () => {
    expect(extractApiKeyFromHeaders({ 'x-api-key': 'key-abc' })).toBe('key-abc');
  });
});

describe('verifyApiKey', () => {
  const cfg = loadApiKeyConfig('correct-key-12345678');

  it('passes when auth not required', () => {
    expect(verifyApiKey(undefined, loadApiKeyConfig(undefined))).toBe(true);
  });

  it('rejects wrong key', () => {
    expect(verifyApiKey('wrong', cfg)).toBe(false);
  });

  it('accepts matching key', () => {
    expect(verifyApiKey('correct-key-12345678', cfg)).toBe(true);
  });
});

describe('isPublicApiPath', () => {
  it('allows health', () => {
    expect(isPublicApiPath('GET', '/health')).toBe(true);
    expect(isPublicApiPath('GET', '/ready')).toBe(true);
  });

  it('allows signed download', () => {
    expect(isPublicApiPath('GET', '/v1/jobs/abc/download')).toBe(true);
  });

  it('requires auth for other v1 routes', () => {
    expect(isPublicApiPath('POST', '/v1/uploads')).toBe(false);
  });
});
