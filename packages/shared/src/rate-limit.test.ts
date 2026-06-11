import { describe, it, expect } from 'vitest';
import { shouldSkipRateLimit, isUploadRateLimitPath } from './rate-limit.js';

describe('shouldSkipRateLimit', () => {
  it('skips health and static', () => {
    expect(shouldSkipRateLimit('GET', '/health')).toBe(true);
    expect(shouldSkipRateLimit('GET', '/assets/app.js')).toBe(true);
  });

  it('skips docs', () => {
    expect(shouldSkipRateLimit('GET', '/docs')).toBe(true);
  });

  it('limits v1 API', () => {
    expect(shouldSkipRateLimit('POST', '/v1/uploads')).toBe(false);
  });

  it('skips public download', () => {
    expect(shouldSkipRateLimit('GET', '/v1/jobs/abc/download')).toBe(true);
  });
});

describe('isUploadRateLimitPath', () => {
  it('matches upload endpoints', () => {
    expect(isUploadRateLimitPath('POST', '/v1/uploads')).toBe(true);
    expect(isUploadRateLimitPath('POST', '/v1/uploads/init')).toBe(true);
    expect(isUploadRateLimitPath('POST', '/v1/uploads/u1/chunks/0')).toBe(true);
  });

  it('ignores non-upload', () => {
    expect(isUploadRateLimitPath('GET', '/v1/jobs/1')).toBe(false);
  });
});
