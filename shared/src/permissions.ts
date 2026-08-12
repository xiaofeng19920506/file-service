import type { UserRole } from './db/schema.js';

export type { UserRole };

const VALID_ROLES: UserRole[] = ['admin', 'user'];

/** 旧角色映射到 user；未知 → user */
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  if (raw === 'admin') return 'admin';
  if (raw === 'user') return 'user';
  // 历史角色一律降为普通用户
  if (
    raw === 'member'
    || raw === 'worship_team'
    || raw === 'creator'
    || raw === 'vip'
  ) {
    return 'user';
  }
  return 'user';
}

export function isValidUserRole(raw: string): raw is UserRole {
  return VALID_ROLES.includes(raw as UserRole);
}

function isLoggedIn(role: UserRole | null): boolean {
  return role === 'admin' || role === 'user';
}

export function canAccessPlaylists(role: UserRole | null): boolean {
  return isLoggedIn(role);
}

export function canExportToYoutube(role: UserRole | null): boolean {
  return isLoggedIn(role);
}

export function canEdit(role: UserRole | null): boolean {
  return role === 'admin';
}

/** @deprecated 诗库已移除；保留函数避免旧调用编译失败，恒为 false */
export function canSearch(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated */
export function canDownload(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated */
export function canMerge(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated */
export function canUpload(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated 周报已移除；保留避免旧 API 编译失败，恒为 false */
export function canManageBulletin(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated */
export function canViewBulletin(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated */
export function canEditBulletinWorshipSongs(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated VIP 已移除 */
export function canAccessVipVideo(_role: UserRole | null): boolean {
  return false;
}

/** MP3-only：不再提供歌单视频模式 */
export function canPlayPlaylistVideo(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated */
export function isVipOnlyRole(_role: UserRole | null): boolean {
  return false;
}

export function isPlaylistPath(method: string, path: string): boolean {
  if (path.startsWith('/v1/playlists')) return true;
  if (method === 'POST' && path === '/v1/youtube/plays') return true;
  if (method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/captions$/.test(path)) return true;
  if (method === 'POST' && path === '/v1/youtube/audio/prioritize') return true;
  if (/^\/v1\/youtube\/videos\/[^/]+\/audio/.test(path)) return true;
  return false;
}

export function isYoutubeBrowsePath(method: string, path: string): boolean {
  if (method === 'GET' && path === '/v1/youtube/search') return true;
  if (method === 'GET' && path === '/v1/youtube/search/suggest') return true;
  if (method === 'GET' && path === '/v1/youtube/recommendations') return true;
  if (method === 'POST' && path === '/v1/youtube/searches') return true;
  if (method === 'GET' && path === '/v1/youtube/trending') return true;
  return false;
}

export function isAdminUserManagePath(method: string, path: string): boolean {
  if (method === 'GET' && path === '/v1/admin/users') return true;
  if (method === 'PATCH' && /^\/v1\/admin\/users\/[^/]+$/.test(path)) return true;
  if (method === 'DELETE' && /^\/v1\/admin\/users\/[^/]+$/.test(path)) return true;
  return false;
}

export function isAdminOnlyPath(method: string, path: string): boolean {
  return isAdminUserManagePath(method, path);
}

export function isYoutubeOAuthCallbackPath(method: string, path: string): boolean {
  return method === 'GET' && path === '/v1/youtube/oauth/callback';
}

export function isYoutubeExportPath(method: string, path: string): boolean {
  if (isYoutubeOAuthCallbackPath(method, path)) return false;
  if (path.startsWith('/v1/youtube/oauth')) return true;
  if (path.startsWith('/v1/youtube/playlists')) return true;
  if (method === 'POST' && /^\/v1\/playlists\/[^/]+\/export-youtube$/.test(path)) return true;
  return false;
}

/** API 路径所需的最低权限级别 */
export type PathAccessLevel =
  | 'public'
  | 'user'
  | 'playlist'
  | 'admin'
  | 'youtube_export'
  | 'youtube_browse'
  | 'session';

function isPublicInfrastructurePath(path: string): boolean {
  return path === '/health' || path === '/ready' || path === '/docs' || path.startsWith('/docs/');
}

function isSignedAudioStreamPath(method: string, path: string): boolean {
  return method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/audio\/stream$/.test(path);
}

function isSignedAudioPreviewPath(method: string, path: string): boolean {
  return method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/audio\/preview$/.test(path);
}

/** 缩略图经 API 代理；<img> 无法带 Bearer，须公开 */
function isYoutubeThumbnailPath(method: string, path: string): boolean {
  return method === 'GET' && /^\/v1\/youtube\/thumbnails\/[^/]+$/.test(path);
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
  if (isSignedAudioStreamPath(method, path)) return 'public';
  if (isSignedAudioPreviewPath(method, path)) return 'public';
  if (isYoutubeThumbnailPath(method, path)) return 'public';
  if (isAuthEntryPath(method, path)) return 'public';
  if (isYoutubeOAuthCallbackPath(method, path)) return 'public';
  if (isYoutubeBrowsePath(method, path)) return 'youtube_browse';
  if (isYoutubeExportPath(method, path)) return 'youtube_export';
  if (isAdminOnlyPath(method, path)) return 'admin';
  if (isPlaylistPath(method, path)) return 'playlist';
  if (isSessionPath(method, path)) return 'session';
  if (path.startsWith('/v1/')) return 'user';
  return 'public';
}

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
    case 'user':
    case 'playlist':
    case 'youtube_export':
    case 'youtube_browse':
    case 'session':
      return isLoggedIn(role);
    case 'admin':
      return canEdit(role);
    default:
      return false;
  }
}

export function accessDeniedErrorCode(level: PathAccessLevel): string {
  switch (level) {
    case 'playlist':
    case 'youtube_browse':
      return 'playlist_forbidden';
    case 'admin':
      return 'admin_required';
    case 'youtube_export':
      return 'youtube_export_forbidden';
    case 'session':
    case 'user':
      return 'unauthorized';
    default:
      return 'forbidden';
  }
}

/** @deprecated stubs for removed features */
export function isSearchPath(_method: string, _path: string): boolean {
  return false;
}
export function isGuestBrowsePath(method: string, path: string): boolean {
  return isSearchPath(method, path);
}
export function isDownloadPath(_method: string, _path: string): boolean {
  return false;
}
export function isUploadPath(_method: string, _path: string): boolean {
  return false;
}
export function isMergePath(_method: string, _path: string): boolean {
  return false;
}
export function isVipVideoPath(_method: string, _path: string): boolean {
  return false;
}
export function isEditPath(_method: string, _path: string): boolean {
  return false;
}
export function isAdminWritePath(method: string, path: string): boolean {
  return isEditPath(method, path);
}
