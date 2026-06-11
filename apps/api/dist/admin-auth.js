import { extractApiKeyFromHeaders, isAdminWritePath, signAdminToken, verifyAdminToken, verifyApiKey, } from '@file-service/shared';
export function loadAdminConfig(env) {
    const password = env.ADMIN_PASSWORD?.trim();
    return {
        enabled: !!password,
        password: password || undefined,
        sessionTtlSeconds: env.ADMIN_SESSION_TTL_SECONDS,
    };
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
export function isAuthorizedRequest(opts) {
    const { provided, apiKeyConfig, sessionSecret } = opts;
    if (verifyApiKey(provided, apiKeyConfig))
        return true;
    if (provided && verifyAdminToken({ secret: sessionSecret, token: provided }))
        return true;
    if (!apiKeyConfig.required)
        return true;
    return false;
}
export function hasAdminSession(opts) {
    const { provided, sessionSecret } = opts;
    return !!(provided && verifyAdminToken({ secret: sessionSecret, token: provided }));
}
export function registerAdminRoutes(app, deps) {
    const { adminConfig, apiKeyConfig, sessionSecret } = deps;
    app.post('/v1/admin/login', async (request, reply) => {
        if (!adminConfig.enabled || !adminConfig.password) {
            return reply.code(503).send({ error: 'admin_not_configured' });
        }
        const password = request.body?.password?.trim() ?? '';
        if (!password || !timingSafeEqual(password, adminConfig.password)) {
            return reply.code(401).send({ error: 'invalid_admin_password' });
        }
        const expiresAtUnix = Math.floor(Date.now() / 1000) + adminConfig.sessionTtlSeconds;
        const token = signAdminToken({ secret: sessionSecret, expiresAtUnix });
        return {
            token,
            expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
        };
    });
    app.get('/v1/admin/session', async (request, reply) => {
        if (!adminConfig.enabled) {
            return reply.code(503).send({ error: 'admin_not_configured' });
        }
        const provided = extractApiKeyFromHeaders({
            authorization: request.headers.authorization,
            'x-api-key': request.headers['x-api-key'],
        });
        const session = provided
            ? verifyAdminToken({ secret: sessionSecret, token: provided })
            : null;
        if (!session)
            return reply.code(401).send({ error: 'admin_session_invalid' });
        return {
            ok: true,
            expiresAt: new Date(session.expiresAtUnix * 1000).toISOString(),
        };
    });
    app.addHook('preHandler', async (request, reply) => {
        if (!adminConfig.enabled)
            return;
        const path = request.url.split('?')[0] ?? request.url;
        if (!isAdminWritePath(request.method, path))
            return;
        const provided = extractApiKeyFromHeaders({
            authorization: request.headers.authorization,
            'x-api-key': request.headers['x-api-key'],
        });
        if (verifyApiKey(provided, apiKeyConfig))
            return;
        if (hasAdminSession({ provided, sessionSecret }))
            return;
        return reply.code(403).send({ error: 'admin_required' });
    });
}
//# sourceMappingURL=admin-auth.js.map