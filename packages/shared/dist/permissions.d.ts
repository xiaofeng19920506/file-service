import type { UserRole } from './db/schema.js';
export type { UserRole };
export declare function normalizeUserRole(raw: string | null | undefined): UserRole;
export declare function isValidUserRole(raw: string): raw is UserRole;
export declare function canSearch(_role: UserRole | null): boolean;
export declare function canDownload(role: UserRole | null): boolean;
export declare function canMerge(role: UserRole | null): boolean;
export declare function canUpload(role: UserRole | null): boolean;
export declare function canEdit(role: UserRole | null): boolean;
export declare function isGuestBrowsePath(method: string, path: string): boolean;
export declare function isDownloadPath(method: string, path: string): boolean;
export declare function isUploadPath(method: string, path: string): boolean;
export declare function isMergePath(method: string, path: string): boolean;
export declare function isEditPath(method: string, path: string): boolean;
export declare function isAdminUserManagePath(method: string, path: string): boolean;
export declare function isAdminOnlyPath(method: string, path: string): boolean;
/** @deprecated use isEditPath */
export declare function isAdminWritePath(method: string, path: string): boolean;
/** API 路径所需的最低权限级别 */
export type PathAccessLevel = 'public' | 'guest_browse' | 'member' | 'download' | 'upload' | 'merge' | 'admin';
/** 解析路径所需的最低权限（未识别的 /v1/* 默认需登录） */
export declare function resolvePathAccessLevel(method: string, path: string): PathAccessLevel;
/** 是否可在无凭证情况下访问（健康检查、登录、游客浏览诗库等） */
export declare function isUnauthenticatedAccessAllowed(method: string, path: string): boolean;
export declare function roleMeetsAccessLevel(level: PathAccessLevel, role: UserRole | null): boolean;
export declare function accessDeniedErrorCode(level: PathAccessLevel): string;
//# sourceMappingURL=permissions.d.ts.map