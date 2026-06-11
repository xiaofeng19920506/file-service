const VALID_ROLES = ['member', 'worship_team', 'admin'];
export function normalizeUserRole(raw) {
    if (raw === 'admin' || raw === 'worship_team' || raw === 'member')
        return raw;
    if (raw === 'user')
        return 'member';
    return 'member';
}
export function isValidUserRole(raw) {
    return VALID_ROLES.includes(raw);
}
export function canSearch(_role) {
    return true;
}
export function canDownload(role) {
    return role === 'member' || role === 'worship_team' || role === 'admin';
}
export function canMerge(role) {
    return role === 'worship_team' || role === 'admin';
}
export function canUpload(role) {
    return role === 'worship_team' || role === 'admin';
}
export function canEdit(role) {
    return role === 'admin';
}
export function isGuestBrowsePath(method, path) {
    return method === 'GET' && path === '/v1/blobs';
}
export function isDownloadPath(method, path) {
    if (method !== 'GET')
        return false;
    return /^\/v1\/blobs\/[^/]+\/content$/.test(path)
        || /^\/v1\/blobs\/[^/]+\/preview\.pptx$/.test(path);
}
export function isUploadPath(method, path) {
    if (path === '/v1/blobs/exists' && method === 'GET')
        return true;
    if (path === '/v1/uploads' && method === 'POST')
        return true;
    if (path === '/v1/uploads/init' && method === 'POST')
        return true;
    if (/^\/v1\/uploads\/[^/]+\/complete$/.test(path) && method === 'POST')
        return true;
    if (/^\/v1\/uploads\/[^/]+\/chunks\/\d+$/.test(path) && method === 'POST')
        return true;
    return false;
}
export function isMergePath(method, path) {
    if (!path.startsWith('/v1/jobs'))
        return false;
    if (method === 'GET' && /^\/v1\/jobs\/[^/]+\/download$/.test(path))
        return false;
    return true;
}
export function isEditPath(method, path) {
    if (method === 'PATCH' && /^\/v1\/blobs\/[^/]+\/metadata$/.test(path))
        return true;
    if (method === 'PUT' && /^\/v1\/blobs\/[^/]+\/content$/.test(path))
        return true;
    if (method === 'DELETE' && /^\/v1\/blobs\/[^/]+$/.test(path))
        return true;
    return false;
}
export function isAdminUserManagePath(method, path) {
    if (method === 'GET' && path === '/v1/admin/users')
        return true;
    if (method === 'PATCH' && /^\/v1\/admin\/users\/[^/]+$/.test(path))
        return true;
    return false;
}
export function isAdminOnlyPath(method, path) {
    return isEditPath(method, path) || isAdminUserManagePath(method, path);
}
/** @deprecated use isEditPath */
export function isAdminWritePath(method, path) {
    return isEditPath(method, path);
}
function isPublicInfrastructurePath(path) {
    return path === '/health' || path === '/ready' || path === '/docs' || path.startsWith('/docs/');
}
function isSignedMergeDownloadPath(method, path) {
    return method === 'GET' && /^\/v1\/jobs\/[^/]+\/download$/.test(path);
}
function isAuthEntryPath(method, path) {
    return ((method === 'POST' && path === '/v1/auth/register')
        || (method === 'POST' && path === '/v1/auth/login'));
}
function isSessionPath(method, path) {
    return method === 'GET' && path === '/v1/auth/session';
}
/** 解析路径所需的最低权限（未识别的 /v1/* 默认需登录） */
export function resolvePathAccessLevel(method, path) {
    if (isPublicInfrastructurePath(path))
        return 'public';
    if (isSignedMergeDownloadPath(method, path))
        return 'public';
    if (isAuthEntryPath(method, path))
        return 'public';
    if (isGuestBrowsePath(method, path))
        return 'guest_browse';
    if (isAdminOnlyPath(method, path))
        return 'admin';
    if (isUploadPath(method, path))
        return 'upload';
    if (isMergePath(method, path))
        return 'merge';
    if (isDownloadPath(method, path))
        return 'download';
    if (isSessionPath(method, path))
        return 'member';
    if (path.startsWith('/v1/'))
        return 'member';
    return 'public';
}
/** 是否可在无凭证情况下访问（健康检查、登录、游客浏览诗库等） */
export function isUnauthenticatedAccessAllowed(method, path) {
    const level = resolvePathAccessLevel(method, path);
    return level === 'public' || level === 'guest_browse';
}
export function roleMeetsAccessLevel(level, role) {
    switch (level) {
        case 'public':
        case 'guest_browse':
            return true;
        case 'member':
            return role === 'member' || role === 'worship_team' || role === 'admin';
        case 'download':
            return canDownload(role);
        case 'upload':
            return canUpload(role);
        case 'merge':
            return canMerge(role);
        case 'admin':
            return canEdit(role);
        default:
            return false;
    }
}
export function accessDeniedErrorCode(level) {
    switch (level) {
        case 'download':
            return 'download_forbidden';
        case 'upload':
            return 'upload_forbidden';
        case 'merge':
            return 'merge_forbidden';
        case 'admin':
            return 'admin_required';
        case 'member':
            return 'unauthorized';
        default:
            return 'forbidden';
    }
}
//# sourceMappingURL=permissions.js.map