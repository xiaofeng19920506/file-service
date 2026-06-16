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

  it('marks blob search as search (login + worship team)', () => {
    expect(resolvePathAccessLevel('GET', '/v1/blobs')).toBe('search');
  });

  it('classifies protected routes', () => {
    expect(resolvePathAccessLevel('GET', '/v1/blobs/x/content')).toBe('download');
    expect(resolvePathAccessLevel('POST', '/v1/uploads')).toBe('upload');
    expect(resolvePathAccessLevel('GET', '/v1/playlists')).toBe('playlist');
    expect(resolvePathAccessLevel('GET', '/v1/youtube/search')).toBe('youtube_browse');
    expect(resolvePathAccessLevel('GET', '/v1/youtube/trending')).toBe('youtube_browse');
    expect(resolvePathAccessLevel('POST', '/v1/jobs')).toBe('merge');
    expect(resolvePathAccessLevel('DELETE', '/v1/blobs/x')).toBe('admin');
    expect(resolvePathAccessLevel('GET', '/v1/admin/users')).toBe('admin');
    expect(resolvePathAccessLevel('DELETE', '/v1/admin/users/user-1')).toBe('admin');
    expect(resolvePathAccessLevel('GET', '/v1/auth/session')).toBe('session');
    expect(resolvePathAccessLevel('GET', '/v1/youtube/oauth/status')).toBe('youtube_export');
    expect(resolvePathAccessLevel('POST', '/v1/playlists/x/export-youtube')).toBe('youtube_export');
    expect(resolvePathAccessLevel('GET', '/v1/youtube/oauth/callback')).toBe('public');
  });

  it('defaults unknown v1 routes to member', () => {
    expect(resolvePathAccessLevel('GET', '/v1/unknown')).toBe('member');
  });
});

describe('roleMeetsAccessLevel', () => {
  it('requires login for blob search', () => {
    expect(roleMeetsAccessLevel('search', null)).toBe(false);
    expect(roleMeetsAccessLevel('search', 'member')).toBe(false);
    expect(roleMeetsAccessLevel('search', 'worship_team')).toBe(true);
  });

  it('allows playlists for all logged-in roles', () => {
    expect(roleMeetsAccessLevel('playlist', 'member')).toBe(true);
    expect(roleMeetsAccessLevel('playlist', 'worship_team')).toBe(true);
  });

  it('enforces member login', () => {
    expect(roleMeetsAccessLevel('member', null)).toBe(false);
    expect(roleMeetsAccessLevel('member', 'member')).toBe(true);
    expect(roleMeetsAccessLevel('member', 'vip')).toBe(false);
  });

  it('allows vip video for vip role only', () => {
    expect(roleMeetsAccessLevel('vip_video', 'vip')).toBe(true);
    expect(roleMeetsAccessLevel('vip_video', 'member')).toBe(false);
    expect(roleMeetsAccessLevel('vip_video', 'admin')).toBe(true);
  });

  it('allows youtube browse for vip and playlist roles', () => {
    expect(roleMeetsAccessLevel('youtube_browse', 'vip')).toBe(true);
    expect(roleMeetsAccessLevel('youtube_browse', 'member')).toBe(true);
    expect(roleMeetsAccessLevel('youtube_browse', 'worship_team')).toBe(true);
    expect(roleMeetsAccessLevel('youtube_browse', null)).toBe(false);
  });

  it('allows session for vip', () => {
    expect(roleMeetsAccessLevel('session', 'vip')).toBe(true);
    expect(roleMeetsAccessLevel('session', null)).toBe(false);
  });

  it('enforces merge for worship team', () => {
    expect(roleMeetsAccessLevel('merge', 'member')).toBe(false);
    expect(roleMeetsAccessLevel('merge', 'worship_team')).toBe(true);
  });

  it('enforces admin only paths', () => {
    expect(roleMeetsAccessLevel('admin', 'worship_team')).toBe(false);
    expect(roleMeetsAccessLevel('admin', 'admin')).toBe(true);
  });

  it('enforces youtube export for worship team', () => {
    expect(roleMeetsAccessLevel('youtube_export', 'member')).toBe(false);
    expect(roleMeetsAccessLevel('youtube_export', 'worship_team')).toBe(true);
    expect(roleMeetsAccessLevel('youtube_export', 'admin')).toBe(true);
  });
});

describe('isPublicApiPath', () => {
  it('blob search requires authentication', () => {
    expect(isPublicApiPath('GET', '/v1/blobs')).toBe(false);
    expect(isUnauthenticatedAccessAllowed('GET', '/v1/blobs')).toBe(false);
    expect(isPublicApiPath('POST', '/v1/jobs')).toBe(false);
  });
});

describe('accessDeniedErrorCode', () => {
  it('maps levels to error codes', () => {
    expect(accessDeniedErrorCode('search')).toBe('search_forbidden');
    expect(accessDeniedErrorCode('download')).toBe('download_forbidden');
    expect(accessDeniedErrorCode('admin')).toBe('admin_required');
    expect(accessDeniedErrorCode('member')).toBe('unauthorized');
  });
});
