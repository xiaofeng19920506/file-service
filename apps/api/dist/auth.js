import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { extractApiKeyFromHeaders, formatUserDisplayName, isValidPersonName, normalizeUserRole, signUserToken, users, matchesApiKey, verifyUserToken, } from '@file-service/shared';
import { registerApiAuthHooks } from './api-auth-middleware.js';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64, SCRYPT_PARAMS);
    return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}
export function verifyPassword(password, stored) {
    const parts = stored.split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt')
        return false;
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    const actual = scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
    if (actual.length !== expected.length)
        return false;
    return timingSafeEqual(actual, expected);
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function parseEmailSet(raw) {
    if (!raw?.trim())
        return new Set();
    return new Set(raw
        .split(',')
        .map((e) => normalizeEmail(e))
        .filter(Boolean));
}
function resolveRegisterRole(email, userCount, adminEmails, worshipTeamEmails) {
    if (userCount === 0 || adminEmails.has(email))
        return 'admin';
    if (worshipTeamEmails.has(email))
        return 'worship_team';
    return 'member';
}
function userPayload(row) {
    return {
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        role: normalizeUserRole(row.role),
    };
}
function issueToken(env, user) {
    const expiresAtUnix = Math.floor(Date.now() / 1000) + env.USER_SESSION_TTL_SECONDS;
    const token = signUserToken({
        secret: env.DOWNLOAD_HMAC_SECRET,
        userId: user.id,
        email: user.email,
        role: user.role,
        expiresAtUnix,
    });
    return {
        token,
        expiresAt: new Date(expiresAtUnix * 1000).toISOString(),
    };
}
export function resolveAuthUser(request, sessionSecret) {
    if (request.authUser)
        return request.authUser;
    const provided = extractApiKeyFromHeaders({
        authorization: request.headers.authorization,
        'x-api-key': request.headers['x-api-key'],
    });
    const claims = provided
        ? verifyUserToken({ secret: sessionSecret, token: provided })
        : null;
    if (!claims)
        return undefined;
    const localPart = claims.email.split('@')[0] ?? claims.email;
    return {
        id: claims.userId,
        email: claims.email,
        firstName: localPart,
        lastName: '',
        role: claims.role,
    };
}
export function registerAuthRoutes(app, deps) {
    const { db, env, apiKeyConfig } = deps;
    const adminEmails = parseEmailSet(env.ADMIN_EMAILS);
    const worshipTeamEmails = parseEmailSet(env.WORSHIP_TEAM_EMAILS);
    const sessionSecret = env.DOWNLOAD_HMAC_SECRET;
    registerApiAuthHooks(app, {
        sessionSecret,
        apiKeyConfig,
        authRequired: env.AUTH_REQUIRED,
        resolveUser: async (userId) => {
            const [row] = await db.select().from(users).where(eq(users.id, userId));
            return row ? userPayload(row) : null;
        },
    });
    app.post('/v1/auth/register', async (request, reply) => {
        const email = normalizeEmail(request.body?.email ?? '');
        const password = request.body?.password ?? '';
        const firstName = request.body?.firstName?.trim() ?? '';
        const lastName = request.body?.lastName?.trim() ?? '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return reply.code(400).send({ error: 'invalid_email' });
        }
        if (password.length < 8) {
            return reply.code(400).send({ error: 'weak_password' });
        }
        if (!isValidPersonName(firstName)) {
            return reply.code(400).send({ error: 'invalid_first_name' });
        }
        if (!isValidPersonName(lastName)) {
            return reply.code(400).send({ error: 'invalid_last_name' });
        }
        const [{ count }] = await db
            .select({ count: sql `count(*)::int` })
            .from(users);
        const role = resolveRegisterRole(email, count, adminEmails, worshipTeamEmails);
        try {
            const [row] = await db
                .insert(users)
                .values({
                email,
                passwordHash: hashPassword(password),
                firstName,
                lastName,
                role,
            })
                .returning();
            const session = issueToken(env, {
                id: row.id,
                email: row.email,
                role: normalizeUserRole(row.role),
            });
            return {
                ...session,
                user: userPayload(row),
            };
        }
        catch {
            return reply.code(409).send({ error: 'email_already_exists' });
        }
    });
    app.post('/v1/auth/login', async (request, reply) => {
        const email = normalizeEmail(request.body?.email ?? '');
        const password = request.body?.password ?? '';
        if (!email || !password) {
            return reply.code(400).send({ error: 'invalid_credentials' });
        }
        const [row] = await db.select().from(users).where(eq(users.email, email));
        if (!row || !verifyPassword(password, row.passwordHash)) {
            return reply.code(401).send({ error: 'invalid_credentials' });
        }
        const session = issueToken(env, {
            id: row.id,
            email: row.email,
            role: normalizeUserRole(row.role),
        });
        return {
            ...session,
            user: userPayload(row),
        };
    });
    app.get('/v1/auth/session', async (request, reply) => {
        if (request.authUser) {
            const provided = extractApiKeyFromHeaders({
                authorization: request.headers.authorization,
                'x-api-key': request.headers['x-api-key'],
            });
            const claims = provided
                ? verifyUserToken({ secret: sessionSecret, token: provided })
                : null;
            if (!claims)
                return reply.code(401).send({ error: 'session_invalid' });
            return {
                expiresAt: new Date(claims.expiresAtUnix * 1000).toISOString(),
                user: request.authUser,
            };
        }
        return reply.code(401).send({ error: 'session_invalid' });
    });
}
export function getRequestActorLabel(request, sessionSecret, apiKeyConfig) {
    const user = request.authUser ?? resolveAuthUser(request, sessionSecret);
    if (user) {
        const label = formatUserDisplayName(user);
        return label || user.email;
    }
    const provided = extractApiKeyFromHeaders({
        authorization: request.headers.authorization,
        'x-api-key': request.headers['x-api-key'],
    });
    if (matchesApiKey(provided, apiKeyConfig))
        return 'api';
    return 'unknown';
}
//# sourceMappingURL=auth.js.map