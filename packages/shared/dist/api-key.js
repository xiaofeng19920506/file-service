import { isUnauthenticatedAccessAllowed } from './permissions.js';
export function loadApiKeyConfig(apiKey) {
    const trimmed = apiKey?.trim();
    return {
        required: !!trimmed,
        key: trimmed || undefined,
    };
}
export function extractApiKeyFromHeaders(headers) {
    const auth = headers.authorization;
    if (auth?.startsWith('Bearer ')) {
        const token = auth.slice(7).trim();
        if (token)
            return token;
    }
    const raw = headers['x-api-key'];
    if (typeof raw === 'string' && raw.trim())
        return raw.trim();
    if (Array.isArray(raw) && raw[0]?.trim())
        return raw[0].trim();
    return undefined;
}
export function verifyApiKey(provided, config) {
    if (!config.required)
        return true;
    return matchesApiKey(provided, config);
}
export function matchesApiKey(provided, config) {
    if (!provided || !config.key)
        return false;
    return timingSafeEqual(provided, config.key);
}
function timingSafeEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
/** 无需登录的路径（健康检查、登录注册、签名下载、游客浏览诗库等） */
export function isPublicApiPath(method, path) {
    return isUnauthenticatedAccessAllowed(method, path);
}
//# sourceMappingURL=api-key.js.map