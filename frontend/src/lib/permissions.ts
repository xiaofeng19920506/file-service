export type UserRole = 'member' | 'worship_team' | 'creator' | 'admin' | 'vip';

/** 将数据库/旧 token 中的 role 规范化为当前角色 */
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  if (raw === 'admin' || raw === 'worship_team' || raw === 'creator' || raw === 'member' || raw === 'vip') {
    return raw;
  }
  if (raw === 'user') return 'member';
  return 'member';
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

export function canEditBulletinWorshipSongs(role: UserRole | null): boolean {
  return canViewBulletin(role);
}

export function canStartWorship(role: UserRole | null): boolean {
  return isWorshipCapable(role);
}

export function canAccessVipVideo(role: UserRole | null): boolean {
  return role === 'vip' || role === 'admin';
}

/** 播放列表 YouTube 视频模式；普通成员（member）仅可 MP3 */
export function canPlayPlaylistVideo(role: UserRole | null): boolean {
  return role === 'vip' || isWorshipCapable(role);
}

export function isVipOnlyRole(role: UserRole | null): boolean {
  return role === 'vip';
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
    canStartWorship: canStartWorship(normalized),
    canAccessVipVideo: canAccessVipVideo(normalized),
    canPlayPlaylistVideo: canPlayPlaylistVideo(normalized),
    isVipOnly: isVipOnlyRole(normalized),
  };
}

export type AppPermissions = ReturnType<typeof permissionsForRole>;

export const APP_HOME_PAGE = 'playlists' as const;

export function homePageForPermissions(
  permissions: AppPermissions,
): typeof APP_HOME_PAGE | 'library' | 'bulletin' | 'vip-video' {
  if (permissions.isVipOnly) return 'vip-video';
  if (permissions.canManageBulletin) return 'bulletin';
  if (permissions.canAccessPlaylists) return APP_HOME_PAGE;
  if (permissions.canSearch) return 'library';
  if (permissions.canAccessVipVideo) return 'vip-video';
  return APP_HOME_PAGE;
}
