import { describe, it, expect } from 'vitest';
import {
  DEFAULT_UPLOAD_CHUNK_SIZE,
  CHUNKED_UPLOAD_MIN_BYTES,
  UPLOAD_SESSION_TTL_MS,
} from './upload-chunk.js';

describe('upload chunk constants', () => {
  it('uses 5MB default chunk size', () => {
    expect(DEFAULT_UPLOAD_CHUNK_SIZE).toBe(5 * 1024 * 1024);
  });

  it('requires chunked upload above 8MB', () => {
    expect(CHUNKED_UPLOAD_MIN_BYTES).toBe(8 * 1024 * 1024);
  });

  it('expires upload sessions after 2 hours', () => {
    expect(UPLOAD_SESSION_TTL_MS).toBe(2 * 60 * 60 * 1000);
  });
});
