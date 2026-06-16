import { describe, expect, it } from 'vitest';
import { parseByteRangeHeader } from './http-byte-range.js';

describe('parseByteRangeHeader', () => {
  const size = 1000;

  it('parses bytes=0-499', () => {
    expect(parseByteRangeHeader('bytes=0-499', size)).toEqual({ start: 0, end: 499 });
  });

  it('parses open-ended bytes=500-', () => {
    expect(parseByteRangeHeader('bytes=500-', size)).toEqual({ start: 500, end: 999 });
  });

  it('parses suffix bytes=-200', () => {
    expect(parseByteRangeHeader('bytes=-200', size)).toEqual({ start: 800, end: 999 });
  });

  it('returns null for invalid range', () => {
    expect(parseByteRangeHeader('bytes=2000-3000', size)).toBeNull();
    expect(parseByteRangeHeader('invalid', size)).toBeNull();
  });
});
