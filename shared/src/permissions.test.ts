import { describe, it, expect } from 'vitest';
import { isPublicApiPath } from './api-key.js';
import {
  accessDeniedErrorCode,
  isUnauthenticatedAccessAllowed,
  resolvePathAccessLevel,
  roleMeetsAccessLevel,
} from './permissions.js';

describe('resolvePathAccessLevel', () => {
  it('marks infrastructure as public', () => {
    expect(resolvePathAccessLevel('GET', '/health')).toBe('public');
    expect(resolvePathAccessLevel('GET', '/ready')).toBe('public');
  });

  it('marks auth entry as public', () => {
    expect(resolvePathAccessLevel('POST', '/v1/auth/login')).toBe('public');
    expect(resolvePathAccessLevel('POST', '/v1/auth/register')).toBe('public');
  });

  it('marks guest blob search as guest_browse', () => {
    expect(resolvePathAccessLevel('GET', '/v1/blobs')).toBe('guest_browse');
  });

  it('classifies protected routes', () => {
    expect(resolvePathAccessLevel('GET', '/v1/blobs/x/content')).toBe('download');
    expect(resolvePathAccessLevel('POST', '/v1/uploads')).toBe('upload');
    expect(resolvePathAccessLevel('POST', '/v1/jobs')).toBe('merge');
    expect(resolvePathAccessLevel('DELETE', '/v1/blobs/x')).toBe('admin');
    expect(resolvePathAccessLevel('GET', '/v1/admin/users')).toBe('admin');
    expect(resolvePathAccessLevel('GET', '/v1/auth/session')).toBe('member');
  });

  it('defaults unknown v1 routes to member', () => {
    expect(resolvePathAccessLevel('GET', '/v1/unknown')).toBe('member');
  });
});

describe('roleMeetsAccessLevel', () => {
  it('allows guest browse without role', () => {
    expect(roleMeetsAccessLevel('guest_browse', null)).toBe(true);
  });

  it('enforces member login', () => {
    expect(roleMeetsAccessLevel('member', null)).toBe(false);
    expect(roleMeetsAccessLevel('member', 'member')).toBe(true);
  });

  it('enforces merge for worship team', () => {
    expect(roleMeetsAccessLevel('merge', 'member')).toBe(false);
    expect(roleMeetsAccessLevel('merge', 'worship_team')).toBe(true);
  });

  it('enforces admin only paths', () => {
    expect(roleMeetsAccessLevel('admin', 'worship_team')).toBe(false);
    expect(roleMeetsAccessLevel('admin', 'admin')).toBe(true);
  });
});

describe('isPublicApiPath', () => {
  it('aligns with unauthenticated access', () => {
    expect(isPublicApiPath('GET', '/v1/blobs')).toBe(true);
    expect(isPublicApiPath('POST', '/v1/jobs')).toBe(false);
    expect(isUnauthenticatedAccessAllowed('GET', '/v1/blobs')).toBe(true);
  });
});

describe('accessDeniedErrorCode', () => {
  it('maps levels to error codes', () => {
    expect(accessDeniedErrorCode('download')).toBe('download_forbidden');
    expect(accessDeniedErrorCode('admin')).toBe('admin_required');
    expect(accessDeniedErrorCode('member')).toBe('unauthorized');
  });
});
