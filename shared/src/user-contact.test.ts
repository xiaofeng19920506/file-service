import { describe, expect, it } from 'vitest';
import { validateUserContact } from './user-contact.js';

describe('validateUserContact', () => {
  it('accepts phone without address', () => {
    expect(validateUserContact({ phone: '5551234567' })).toBeNull();
  });

  it('rejects a short phone number', () => {
    expect(validateUserContact({ phone: '123' })).toBe('invalid_phone');
  });
});
