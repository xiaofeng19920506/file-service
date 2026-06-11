import { accessDeniedErrorCode, extractApiKeyFromHeaders, isPublicApiPath, isUnauthenticatedAccessAllowed, matchesApiKey, resolvePathAccessLevel, roleMeetsAccessLevel, verifyUserToken, } from '@file-service/shared';
function requestPath(request) {
    return request.url.split('?')[0] ?? request.url;
}
function extractToken(request) {
    return extractApiKeyFromHeaders({
        authorization: request.headers.authorization,
        'x-api-key': request.headers['x-api-key'],
    });
}
function effectiveRole(request) {
    if (request.apiKeyAuth)
        return 'admin';
    return request.authUser?.role ?? null;
}
export function registerApiAuthHooks(app, deps) {
    const { apiKeyConfig, sessionSecret, authRequired, resolveUser } = deps;
    app.addHook('onRequest', async (request, reply) => {
        const path = requestPath(request);
        if (isUnauthenticatedAccessAllowed(request.method, path))
            return;
        if (!path.startsWith('/v1/'))
            return;
        const provided = extractToken(request);
        if (matchesApiKey(provided, apiKeyConfig)) {
            request.apiKeyAuth = true;
            return;
        }
        const claims = provided
            ? verifyUserToken({ secret: sessionSecret, token: provided })
            : null;
        if (claims) {
            const user = await resolveUser(claims.userId);
            if (!user) {
                return reply.code(401).send({ error: 'session_invalid' });
            }
            request.authUser = user;
            return;
        }
        if (!authRequired && !apiKeyConfig.required)
            return;
        return reply.code(401).send({ error: 'unauthorized' });
    });
    app.addHook('preHandler', async (request, reply) => {
        const path = requestPath(request);
        if (isPublicApiPath(request.method, path))
            return;
        if (!path.startsWith('/v1/'))
            return;
        const level = resolvePathAccessLevel(request.method, path);
        const role = effectiveRole(request);
        if (roleMeetsAccessLevel(level, role))
            return;
        const code = accessDeniedErrorCode(level);
        return reply.code(level === 'member' ? 401 : 403).send({ error: code });
    });
}
//# sourceMappingURL=api-auth-middleware.js.map