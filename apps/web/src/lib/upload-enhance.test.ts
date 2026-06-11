import { describe, it, expect } from 'vitest';
import { friendlyError } from './error-messages.js';
import { runWithConcurrency } from './upload-queue.js';

describe('friendlyError', () => {
  it('maps known API codes', () => {
    expect(friendlyError('unauthorized')).toContain('登录');
    expect(friendlyError('file_too_large')).toContain('大小');
  });

  it('falls back to raw code', () => {
    expect(friendlyError('custom_code')).toBe('custom_code');
  });
});

describe('runWithConcurrency', () => {
  it('runs all tasks with limited concurrency', async () => {
    let running = 0;
    let maxRunning = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return 1;
    });

    const results = await runWithConcurrency(tasks, 2);
    expect(results).toHaveLength(6);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });
});
