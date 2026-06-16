import type { UserRole } from './db/schema.js';

export type { UserRole };

const VALID_ROLES: UserRole[] = ['member', 'worship_team', 'creator', 'admin', 'vip'];
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  if (raw === 'admin' || raw === 'worship_team' || raw === 'creator' || raw === 'member' || raw === 'vip') {
    return raw;
  }
  if (raw === 'user') return 'member';
  return 'member';
}

export function isValidUserRole(raw: string): raw is UserRole {
  return VALID_ROLES.includes(raw as UserRole);
}

function isWorshipCapable(role: UserRole | null): boolean {
  return role === 'worship_team' || role === 'creator' || role === 'admin';
}

export function canSearch(role: UserRole | null): boolean {
  return isWorshipCapable(role);
}

export function canAccessPlaylists(role: UserRole | null): boolean {
  return role === 'member' || isWorshipCapable(role);
}

export function canDownload(role: UserRole | null): boolean {
  return isWorshipCapable(role);
}

export function canMerge(role: UserRole | null): boolean {
  return isWorshipCapable(role);
}

export function canUpload(role: UserRole | null): boolean {
  return isWorshipCapable(role);
}

export function canExportToYoutube(role: UserRole | null): boolean {
  return isWorshipCapable(role);
}

export function canEdit(role: UserRole | null): boolean {
  return role === 'admin';
}

export function canManageBulletin(role: UserRole | null): boolean {
  return role === 'creator' || role === 'admin';
}

export function canViewBulletin(role: UserRole | null): boolean {
  return isWorshipCapable(role);
}

/** 敬拜赞美歌单：敬拜团及以上可直接编辑周报绑定的歌单 */
export function canEditBulletinWorshipSongs(role: UserRole | null): boolean {
  return canViewBulletin(role);
}

export function canAccessVipVideo(role: UserRole | null): boolean {
  return role === 'vip' || role === 'admin';
}

/** 播放列表 YouTube 视频模式（iframe）；普通成员仅 MP3 */
export function canPlayPlaylistVideo(role: UserRole | null): boolean {
  return role === 'vip' || isWorshipCapable(role);
}

export function isVipOnlyRole(role: UserRole | null): boolean {
  return role === 'vip';
}

function isBulletinWorshipPlaylistEditPath(method: string, path: string): boolean {
  if (!/^\/v1\/bulletins\/[^/]+\/worship-playlist/.test(path)) return false;
  if (method === 'POST' && /\/worship-playlist\/invite$/.test(path)) return false;
  if (method === 'POST' && /\/worship-playlist$/.test(path)) return false;
  return (
    (method === 'GET' && /\/worship-playlist$/.test(path))
    || (method === 'POST' && /\/worship-playlist\/open$/.test(path))
    || (method === 'POST' && /\/worship-playlist\/items$/.test(path))
    || (method === 'PUT' && /\/worship-playlist\/items\/order$/.test(path))
    || (method === 'DELETE' && /\/worship-playlist\/items\/[^/]+$/.test(path))
  );
}

export function isSearchPath(method: string, path: string): boolean {
  return method === 'GET' && path === '/v1/blobs';
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
  if (method === 'GET' && path === '/v1/youtube/trending') return true;
  return false;
}

export function isVipVideoPath(method: string, path: string): boolean {
  if (method === 'GET' && path === '/v1/vip/playlist') return true;
  if (method === 'POST' && path === '/v1/youtube/video/prioritize') return true;
  if (method === 'POST' && path === '/v1/youtube/video/status') return true;
  if (method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/video$/.test(path)) return true;
  if (method === 'POST' && /^\/v1\/youtube\/videos\/[^/]+\/video\/extract$/.test(path)) return true;
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

export function isBulletinPath(_method: string, path: string): boolean {
  return path.startsWith('/v1/bulletins');
}

function isBulletinWritePath(method: string, path: string): boolean {
  if (!path.startsWith('/v1/bulletins')) return false;
  return method !== 'GET';
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
  if (method === 'DELETE' && /^\/v1\/admin\/users\/[^/]+$/.test(path)) return true;
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
  if (path.startsWith('/v1/youtube/playlists')) return true;
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
  | 'youtube_export'
  | 'bulletin_view'
  | 'bulletin_worship_edit'
  | 'bulletin_manage'
  | 'vip_video'
  | 'youtube_browse'
  | 'session';

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

function isSignedVideoStreamPath(method: string, path: string): boolean {
  return method === 'GET' && /^\/v1\/youtube\/videos\/[^/]+\/video\/stream$/.test(path);
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
  if (isSignedVideoStreamPath(method, path)) return 'public';
  if (isAuthEntryPath(method, path)) return 'public';
  if (isYoutubeOAuthCallbackPath(method, path)) return 'public';
  if (isVipVideoPath(method, path)) return 'vip_video';
  if (isYoutubeBrowsePath(method, path)) return 'youtube_browse';
  if (isYoutubeExportPath(method, path)) return 'youtube_export';
  if (isBulletinWorshipPlaylistEditPath(method, path)) return 'bulletin_worship_edit';
  if (isBulletinWritePath(method, path)) return 'bulletin_manage';
  if (isBulletinPath(method, path)) return 'bulletin_view';
  if (isSearchPath(method, path)) return 'search';
  if (isAdminOnlyPath(method, path)) return 'admin';
  if (isUploadPath(method, path)) return 'upload';
  if (isPlaylistPath(method, path)) return 'playlist';
  if (isMergePath(method, path)) return 'merge';
  if (isDownloadPath(method, path)) return 'download';
  if (isSessionPath(method, path)) return 'session';
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
      return role === 'member' || role === 'worship_team' || role === 'creator' || role === 'admin';
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
    case 'bulletin_view':
      return canViewBulletin(role);
    case 'bulletin_worship_edit':
      return canEditBulletinWorshipSongs(role);
    case 'bulletin_manage':
      return canManageBulletin(role);
    case 'vip_video':
      return canAccessVipVideo(role);
    case 'youtube_browse':
      return canAccessPlaylists(role) || canAccessVipVideo(role);
    case 'session':
      return (
        role === 'member'
        || role === 'worship_team'
        || role === 'creator'
        || role === 'admin'
        || role === 'vip'
      );
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
    case 'bulletin_view':
    case 'bulletin_worship_edit':
    case 'bulletin_manage':
      return 'bulletin_forbidden';
    case 'vip_video':
      return 'vip_forbidden';
    case 'youtube_browse':
      return 'playlist_forbidden';
    case 'session':
      return 'unauthorized';
    case 'member':
      return 'unauthorized';
    default:
      return 'forbidden';
  }
}
