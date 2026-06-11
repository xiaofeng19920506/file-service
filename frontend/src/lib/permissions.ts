export type UserRole = 'member' | 'worship_team' | 'admin';

/** 将数据库/旧 token 中的 role 规范化为当前角色 */
export function normalizeUserRole(raw: string | null | undefined): UserRole {
  if (raw === 'admin' || raw === 'worship_team' || raw === 'member') return raw;
  if (raw === 'user') return 'member';
  return 'member';
}

export function canSearch(_role: UserRole | null): boolean {
  return true;
}

export function canDownload(role: UserRole | null): boolean {
  return role === 'member' || role === 'worship_team' || role === 'admin';
}

export function canMerge(role: UserRole | null): boolean {
  return role === 'worship_team' || role === 'admin';
}

export function canUpload(role: UserRole | null): boolean {
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
    canSearch: true,
    canDownload: canDownload(normalized),
    canMerge: canMerge(normalized),
    canUpload: canUpload(normalized),
    canEdit: canEdit(normalized),
  };
}
