import { describe, expect, it } from 'vitest';
import {
  accessDeniedErrorCode,
  canAccessPlaylists,
  canEdit,
  isUnauthenticatedAccessAllowed,
  normalizeUserRole,
  resolvePathAccessLevel,
  roleMeetsAccessLevel,
} from './permissions.js';

describe('normalizeUserRole', () => {
  it('keeps admin and user', () => {
    expect(normalizeUserRole('admin')).toBe('admin');
    expect(normalizeUserRole('user')).toBe('user');
  });

  it('maps legacy roles to user', () => {
    expect(normalizeUserRole('member')).toBe('user');
    expect(normalizeUserRole('worship_team')).toBe('user');
    expect(normalizeUserRole('creator')).toBe('user');
    expect(normalizeUserRole('vip')).toBe('user');
    expect(normalizeUserRole('unknown')).toBe('user');
  });
});

describe('resolvePathAccessLevel', () => {
  it('marks infrastructure and auth as public', () => {
    expect(resolvePathAccessLevel('GET', '/health')).toBe('public');
    expect(resolvePathAccessLevel('POST', '/v1/auth/login')).toBe('public');
  });

  it('marks playlists and youtube browse for logged-in users', () => {
    expect(resolvePathAccessLevel('GET', '/v1/playlists')).toBe('playlist');
    expect(resolvePathAccessLevel('GET', '/v1/youtube/search')).toBe('youtube_browse');
  });

  it('marks admin user manage as admin', () => {
    expect(resolvePathAccessLevel('GET', '/v1/admin/users')).toBe('admin');
  });

  it('defaults unknown /v1 to user', () => {
    expect(resolvePathAccessLevel('GET', '/v1/unknown')).toBe('user');
  });
});

describe('roleMeetsAccessLevel', () => {
  it('allows user and admin for playlist', () => {
    expect(roleMeetsAccessLevel('playlist', 'user')).toBe(true);
    expect(roleMeetsAccessLevel('playlist', 'admin')).toBe(true);
    expect(roleMeetsAccessLevel('playlist', null)).toBe(false);
  });

  it('restricts admin paths', () => {
    expect(roleMeetsAccessLevel('admin', 'admin')).toBe(true);
    expect(roleMeetsAccessLevel('admin', 'user')).toBe(false);
  });
});

describe('capability helpers', () => {
  it('playlists for any logged-in role', () => {
    expect(canAccessPlaylists('user')).toBe(true);
    expect(canAccessPlaylists('admin')).toBe(true);
    expect(canAccessPlaylists(null)).toBe(false);
  });

  it('edit only for admin', () => {
    expect(canEdit('admin')).toBe(true);
    expect(canEdit('user')).toBe(false);
  });
});

describe('isUnauthenticatedAccessAllowed', () => {
  it('allows public only', () => {
    expect(isUnauthenticatedAccessAllowed('GET', '/health')).toBe(true);
    expect(isUnauthenticatedAccessAllowed('GET', '/v1/playlists')).toBe(false);
  });
});

describe('accessDeniedErrorCode', () => {
  it('returns known codes', () => {
    expect(accessDeniedErrorCode('admin')).toBe('admin_required');
    expect(accessDeniedErrorCode('playlist')).toBe('playlist_forbidden');
  });
});
