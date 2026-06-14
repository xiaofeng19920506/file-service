import type { UserRole } from './db/schema.js';

export type { UserRole };

const VALID_ROLES: UserRole[] = ['member', 'worship_team', 'admin'];
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  if (raw === 'admin' || raw === 'worship_team' || raw === 'member') return raw;
  if (raw === 'user') return 'member';
  return 'member';
}

export function isValidUserRole(raw: string): raw is UserRole {
  return VALID_ROLES.includes(raw as UserRole);
}

export function canSearch(role: UserRole | null): boolean {
  return role === 'worship_team' || role === 'admin';
}

export function canAccessPlaylists(role: UserRole | null): boolean {
  return role === 'member' || role === 'worship_team' || role === 'admin';
}

export function canDownload(role: UserRole | null): boolean {
  return role === 'worship_team' || role === 'admin';
}

export function canMerge(role: UserRole | null): boolean {
  return role === 'worship_team' || role === 'admin';
}

export function canUpload(role: UserRole | null): boolean {
  return role === 'worship_team' || role === 'admin';
}

export function canExportToYoutube(role: UserRole | null): boolean {
  return role === 'worship_team' || role === 'admin';
}

export function canEdit(role: UserRole | null): boolean {
  return role === 'admin';
}

export function isSearchPath(method: string, path: string): boolean {
  return method === 'GET' && path === '/v1/blobs';
}

export function isPlaylistPath(method: string, path: string): boolean {
  if (path.startsWith('/v1/playlists')) return true;
  if (method === 'GET' && path === '/v1/youtube/search') return true;
  if (method === 'GET' && path === '/v1/youtube/trending') return true;
  if (method === 'POST' && path === '/v1/youtube/plays') return true;
  if (method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/captions$/.test(path)) return true;
  if (method === 'POST' && path === '/v1/youtube/audio/prioritize') return true;
  if (/^\/v1\/youtube\/videos\/[^/]+\/audio/.test(path)) return true;
  return false;
}

/** @deprecated use isSearchPath — kept for callers that still reference guest browse */
export function isGuestBrowsePath(method: string, path: string): boolean {
  return isSearchPath(method, path);
}

export function isDownloadPath(method: string, path: string): boolean {
  if (method !== 'GET') return false;
  return /^\/v1\/blobs\/[^/]+\/content$/.test(path)
    || /^\/v1\/blobs\/[^/]+\/preview\.pptx$/.test(path);
}

export function isUploadPath(method: string, path: string): boolean {
  if (path === '/v1/blobs/exists' && method === 'GET') return true;
  if (path === '/v1/uploads' && method === 'POST') return true;
  if (path === '/v1/uploads/init' && method === 'POST') return true;
  if (/^\/v1\/uploads\/[^/]+\/complete$/.test(path) && method === 'POST') return true;
  if (/^\/v1\/uploads\/[^/]+\/chunks\/\d+$/.test(path) && method === 'POST') return true;
  return false;
}

export function isMergePath(method: string, path: string): boolean {
  if (isPlaylistPath(method, path)) return false;
  if (!path.startsWith('/v1/jobs')) return false;
  if (method === 'GET' && /^\/v1\/jobs\/[^/]+\/download$/.test(path)) return false;
  return true;
}

export function isEditPath(method: string, path: string): boolean {
  if (method === 'PATCH' && /^\/v1\/blobs\/[^/]+\/metadata$/.test(path)) return true;
  if (method === 'PUT' && /^\/v1\/blobs\/[^/]+\/content$/.test(path)) return true;
  if (method === 'DELETE' && /^\/v1\/blobs\/[^/]+$/.test(path)) return true;
  return false;
}

export function isAdminUserManagePath(method: string, path: string): boolean {
  if (method === 'GET' && path === '/v1/admin/users') return true;
  if (method === 'PATCH' && /^\/v1\/admin\/users\/[^/]+$/.test(path)) return true;
  return false;
}

export function isAdminOnlyPath(method: string, path: string): boolean {
  return isEditPath(method, path) || isAdminUserManagePath(method, path);
}

export function isYoutubeOAuthCallbackPath(method: string, path: string): boolean {
  return method === 'GET' && path === '/v1/youtube/oauth/callback';
}

export function isYoutubeExportPath(method: string, path: string): boolean {
  if (isYoutubeOAuthCallbackPath(method, path)) return false;
  if (path.startsWith('/v1/youtube/oauth')) return true;
  if (method === 'POST' && /^\/v1\/playlists\/[^/]+\/export-youtube$/.test(path)) return true;
  return false;
}

/** @deprecated use isEditPath */
export function isAdminWritePath(method: string, path: string): boolean {
  return isEditPath(method, path);
}

/** API 路径所需的最低权限级别 */
export type PathAccessLevel =
  | 'public'
  | 'search'
  | 'member'
  | 'download'
  | 'upload'
  | 'playlist'
  | 'merge'
  | 'admin'
  | 'youtube_export';

function isPublicInfrastructurePath(path: string): boolean {
  return path === '/health' || path === '/ready' || path === '/docs' || path.startsWith('/docs/');
}

function isSignedMergeDownloadPath(method: string, path: string): boolean {
  return method === 'GET' && /^\/v1\/jobs\/[^/]+\/download$/.test(path);
}

function isSignedAudioStreamPath(method: string, path: string): boolean {
  return method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/audio\/stream$/.test(path);
}

function isSignedAudioPreviewPath(method: string, path: string): boolean {
  return method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/audio\/preview$/.test(path);
}

function isAuthEntryPath(method: string, path: string): boolean {
  return (
    (method === 'POST' && path === '/v1/auth/register')
    || (method === 'POST' && path === '/v1/auth/login')
    || (method === 'POST' && path === '/v1/auth/login/check-device')
    || (method === 'POST' && path === '/v1/auth/device-login')
  );
}

function isSessionPath(method: string, path: string): boolean {
  return method === 'GET' && path === '/v1/auth/session';
}

/** 解析路径所需的最低权限（未识别的 /v1/* 默认需登录） */
export function resolvePathAccessLevel(method: string, path: string): PathAccessLevel {
  if (isPublicInfrastructurePath(path)) return 'public';
  if (isSignedMergeDownloadPath(method, path)) return 'public';
  if (isSignedAudioStreamPath(method, path)) return 'public';
  if (isSignedAudioPreviewPath(method, path)) return 'public';
  if (isAuthEntryPath(method, path)) return 'public';
  if (isYoutubeOAuthCallbackPath(method, path)) return 'public';
  if (isYoutubeExportPath(method, path)) return 'youtube_export';
  if (isSearchPath(method, path)) return 'search';
  if (isAdminOnlyPath(method, path)) return 'admin';
  if (isUploadPath(method, path)) return 'upload';
  if (isPlaylistPath(method, path)) return 'playlist';
  if (isMergePath(method, path)) return 'merge';
  if (isDownloadPath(method, path)) return 'download';
  if (isSessionPath(method, path)) return 'member';
  if (path.startsWith('/v1/')) return 'member';
  return 'public';
}

/** 是否可在无凭证情况下访问（健康检查、登录、游客浏览诗库等） */
export function isUnauthenticatedAccessAllowed(method: string, path: string): boolean {
  const level = resolvePathAccessLevel(method, path);
  return level === 'public';
}

export function roleMeetsAccessLevel(
  level: PathAccessLevel,
  role: UserRole | null,
): boolean {
  switch (level) {
    case 'public':
      return true;
    case 'search':
      return canSearch(role);
    case 'member':
      return role === 'member' || role === 'worship_team' || role === 'admin';
    case 'download':
      return canDownload(role);
    case 'upload':
      return canUpload(role);
    case 'playlist':
      return canAccessPlaylists(role);
    case 'merge':
      return canMerge(role);
    case 'admin':
      return canEdit(role);
    case 'youtube_export':
      return canExportToYoutube(role);
    default:
      return false;
  }
}

export function accessDeniedErrorCode(level: PathAccessLevel): string {
  switch (level) {
    case 'search':
      return 'search_forbidden';
    case 'download':
      return 'download_forbidden';
    case 'upload':
      return 'upload_forbidden';
    case 'playlist':
      return 'playlist_forbidden';
    case 'merge':
      return 'merge_forbidden';
    case 'admin':
      return 'admin_required';
    case 'youtube_export':
      return 'youtube_export_forbidden';
    case 'member':
      return 'unauthorized';
    default:
      return 'forbidden';
  }
}
