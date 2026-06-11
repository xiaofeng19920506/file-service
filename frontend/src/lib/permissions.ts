export type UserRole = 'member' | 'worship_team' | 'admin';

/** 将数据库/旧 token 中的 role 规范化为当前角色 */
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  if (raw === 'admin' || raw === 'worship_team' || raw === 'member') return raw;
  if (raw === 'user') return 'member';
  return 'member';
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
  };
}

export type AppPermissions = ReturnType<typeof permissionsForRole>;

export const APP_HOME_PAGE = 'playlists' as const;

export function homePageForPermissions(
  permissions: AppPermissions,
): typeof APP_HOME_PAGE | 'library' {
  if (permissions.canAccessPlaylists) return APP_HOME_PAGE;
  if (permissions.canSearch) return 'library';
  return APP_HOME_PAGE;
}
