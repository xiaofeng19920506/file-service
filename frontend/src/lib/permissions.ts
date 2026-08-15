export type UserRole = 'admin' | 'user';

const VALID_ROLES: UserRole[] = ['admin', 'user'];

/** 旧角色映射到 user；未知 → user */
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  if (raw === 'admin') return 'admin';
  if (raw === 'user') return 'user';
  // 历史角色一律降为普通用户
  if (
    raw === 'member' ||
    raw === 'worship_team' ||
    raw === 'creator' ||
    raw === 'vip'
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

/** @deprecated 诗库已移除 */
export function canSearch(_role: UserRole | null): boolean {
  return false;
}

export function canDownload(role: UserRole | null): boolean {
  return role === 'admin';
}

/** @deprecated */
export function canMerge(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated */
export function canUpload(_role: UserRole | null): boolean {
  return false;
}

/** @deprecated */
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

export function roleLabelKey(role: UserRole): string {
  return `auth.role.${role}`;
}

export function permissionsForRole(role: UserRole | null) {
  const normalized = role ? normalizeUserRole(role) : null;
  return {
    canSearch: canSearch(normalized),
    canAccessPlaylists: canAccessPlaylists(normalized),
    canDownload: canDownload(normalized),
    canMerge: canMerge(normalized),
    canUpload: canUpload(normalized),
    canEdit: canEdit(normalized),
    canExportToYoutube: canExportToYoutube(normalized),
    canManageBulletin: canManageBulletin(normalized),
    canViewBulletin: canViewBulletin(normalized),
    canEditBulletinWorshipSongs: canEditBulletinWorshipSongs(normalized),
    canAccessVipVideo: canAccessVipVideo(normalized),
    canPlayPlaylistVideo: canPlayPlaylistVideo(normalized),
    isVipOnly: isVipOnlyRole(normalized),
  };
}

export type AppPermissions = ReturnType<typeof permissionsForRole>;

export const APP_HOME_PAGE = 'playlists' as const;

export function homePageForPermissions(
  _permissions: AppPermissions,
): typeof APP_HOME_PAGE {
  return APP_HOME_PAGE;
}
