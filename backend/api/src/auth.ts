import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  extractApiKeyFromHeaders,
  formatUserDisplayName,
  getSubscriptionStatusForClient,
  readRequestClientId,
  isValidPersonName,
  normalizeUserRole,
  computeRegistrationTrialEndsAt,
  signUserToken,
  users,
  userLoginDevices,
  matchesApiKey,
  verifyUserToken,
  type ApiEnv,
  type ApiKeyConfig,
  type Db,
  type UserRole,
  type UserRow,
} from '@file-service/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { registerApiAuthHooks } from './api-auth-middleware.js';

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
};

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
    apiKeyAuth?: boolean;
  }
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'base64url');
  const expected = Buffer.from(parts[2]!, 'base64url');
  const actual = scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userPayload(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: normalizeUserRole(row.role),
  };
}

function issueToken(env: ApiEnv, user: { id: string; email: string; role: UserRole }) {
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

function hashDeviceKey(deviceKey: string): string {
  return createHash('sha256').update(deviceKey).digest('base64url');
}

async function registerLoginDevice(
  db: Db,
  userId: string,
  input: { deviceKey?: string; deviceName?: string; platform?: string },
): Promise<void> {
  const deviceKey = input.deviceKey?.trim();
  if (!deviceKey) return;
  const deviceName = input.deviceName?.trim() || 'Unknown device';
  const platform = input.platform?.trim() || 'unknown';
  const deviceKeyHash = hashDeviceKey(deviceKey);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(userLoginDevices)
    .where(eq(userLoginDevices.deviceKeyHash, deviceKeyHash));

  if (existing) {
    await db
      .update(userLoginDevices)
      .set({
        userId,
        deviceName,
        platform,
        lastLoginAt: now,
      })
      .where(eq(userLoginDevices.id, existing.id));
    return;
  }

  await db.insert(userLoginDevices).values({
    userId,
    deviceKeyHash,
    deviceName,
    platform,
    lastLoginAt: now,
  });
}


export function resolveAuthUser(
  request: FastifyRequest,
  sessionSecret: string,
): AuthUser | undefined {
  if (request.authUser) return request.authUser;
  const provided = extractApiKeyFromHeaders({
    authorization: request.headers.authorization,
    'x-api-key': request.headers['x-api-key'],
  });
  const claims = provided
    ? verifyUserToken({ secret: sessionSecret, token: provided })
    : null;
  if (!claims) return undefined;
  const localPart = claims.email.split('@')[0] ?? claims.email;
  return {
    id: claims.userId,
    email: claims.email,
    firstName: localPart,
    lastName: '',
    role: claims.role,
  };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: {
    db: Db;
    env: ApiEnv;
    apiKeyConfig: ApiKeyConfig;
  },
): void {
  const { db, env, apiKeyConfig } = deps;
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

  app.post<{
    Body: {
      email?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      deviceKey?: string;
      deviceName?: string;
      platform?: string;
    };
  }>('/v1/auth/register', async (request, reply) => {
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

    try {
      const premiumTrialEndsAt = computeRegistrationTrialEndsAt(env);
      const [row] = await db
        .insert(users)
        .values({
          email,
          passwordHash: hashPassword(password),
          firstName,
          lastName,
          role: 'member',
          premiumTrialEndsAt,
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
    } catch {
      return reply.code(409).send({ error: 'email_already_exists' });
    }
  });

  app.post<{
    Body: {
      email?: string;
      password?: string;
      deviceKey?: string;
      deviceName?: string;
      platform?: string;
    };
  }>(
    '/v1/auth/login',
    async (request, reply) => {
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
    },
  );

  app.post<{ Body: { email?: string; deviceKey?: string } }>(
    '/v1/auth/login/check-device',
    async (request, reply) => {
      const email = normalizeEmail(request.body?.email ?? '');
      const deviceKey = request.body?.deviceKey?.trim() ?? '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.code(400).send({ error: 'invalid_email' });
      }
      if (!deviceKey) {
        return { trusted: false };
      }

      const [row] = await db.select().from(users).where(eq(users.email, email));
      if (!row) {
        return { trusted: false };
      }

      const deviceKeyHash = hashDeviceKey(deviceKey);
      const [device] = await db
        .select()
        .from(userLoginDevices)
        .where(eq(userLoginDevices.deviceKeyHash, deviceKeyHash));
      if (!device || device.userId !== row.id) {
        return { trusted: false };
      }

      await db
        .update(userLoginDevices)
        .set({ lastLoginAt: new Date() })
        .where(eq(userLoginDevices.id, device.id));

      const session = issueToken(env, {
        id: row.id,
        email: row.email,
        role: normalizeUserRole(row.role),
      });
      return {
        trusted: true,
        ...session,
        user: userPayload(row),
      };
    },
  );

  app.post<{ Body: { deviceKey?: string } }>('/v1/auth/device-login', async (request, reply) => {
    const deviceKey = request.body?.deviceKey?.trim() ?? '';
    if (!deviceKey) {
      return reply.code(400).send({ error: 'invalid_request' });
    }

    const deviceKeyHash = hashDeviceKey(deviceKey);
    const [device] = await db
      .select()
      .from(userLoginDevices)
      .where(eq(userLoginDevices.deviceKeyHash, deviceKeyHash));
    if (!device) {
      return reply.code(401).send({ error: 'device_not_trusted' });
    }

    const [row] = await db.select().from(users).where(eq(users.id, device.userId));
    if (!row) {
      return reply.code(401).send({ error: 'device_not_trusted' });
    }

    await db
      .update(userLoginDevices)
      .set({ lastLoginAt: new Date() })
      .where(eq(userLoginDevices.id, device.id));

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

  app.patch<{ Body: { firstName?: string; lastName?: string } }>(
    '/v1/auth/profile',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const firstName = request.body?.firstName?.trim() ?? '';
      const lastName = request.body?.lastName?.trim() ?? '';
      if (!isValidPersonName(firstName)) {
        return reply.code(400).send({ error: 'invalid_first_name' });
      }
      if (!isValidPersonName(lastName)) {
        return reply.code(400).send({ error: 'invalid_last_name' });
      }

      const [row] = await db
        .update(users)
        .set({ firstName, lastName })
        .where(eq(users.id, user.id))
        .returning();
      if (!row) return reply.code(404).send({ error: 'not_found' });
      return { user: userPayload(row) };
    },
  );

  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>(
    '/v1/auth/change-password',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const currentPassword = request.body?.currentPassword ?? '';
      const newPassword = request.body?.newPassword ?? '';
      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: 'invalid_request' });
      }
      if (newPassword.length < 8) {
        return reply.code(400).send({ error: 'weak_password' });
      }

      const [row] = await db.select().from(users).where(eq(users.id, user.id));
      if (!row || !verifyPassword(currentPassword, row.passwordHash)) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }

      await db
        .update(users)
        .set({ passwordHash: hashPassword(newPassword) })
        .where(eq(users.id, user.id));
      return { ok: true };
    },
  );

  app.post<{
    Body: { deviceKey?: string; deviceName?: string; platform?: string };
  }>('/v1/auth/devices', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const deviceKey = request.body?.deviceKey?.trim() ?? '';
    if (!deviceKey) {
      return reply.code(400).send({ error: 'invalid_request' });
    }

    await registerLoginDevice(db, user.id, {
      deviceKey,
      deviceName: request.body?.deviceName,
      platform: request.body?.platform,
    });
    return { ok: true };
  });

  app.get<{ Querystring: { deviceKey?: string } }>('/v1/auth/devices', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const currentKeyHash = request.query.deviceKey
      ? hashDeviceKey(request.query.deviceKey)
      : null;

    const rows = await db
      .select()
      .from(userLoginDevices)
      .where(eq(userLoginDevices.userId, user.id));

    return {
      devices: rows
        .map((row) => ({
          id: row.id,
          deviceName: row.deviceName,
          platform: row.platform,
          lastLoginAt: row.lastLoginAt.toISOString(),
          isCurrent: currentKeyHash ? row.deviceKeyHash === currentKeyHash : false,
        }))
        .sort((a, b) => Date.parse(b.lastLoginAt) - Date.parse(a.lastLoginAt)),
    };
  });

  app.delete<{ Params: { id: string } }>(
    '/v1/auth/devices/:id',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const deviceId = request.params.id;
      const [row] = await db
        .select()
        .from(userLoginDevices)
        .where(and(eq(userLoginDevices.id, deviceId), eq(userLoginDevices.userId, user.id)));
      if (!row) return reply.code(404).send({ error: 'not_found' });

      await db.delete(userLoginDevices).where(eq(userLoginDevices.id, deviceId));
      return { ok: true };
    },
  );

  app.get('/v1/auth/session', async (request, reply) => {
    if (request.authUser) {
      const provided = extractApiKeyFromHeaders({
        authorization: request.headers.authorization,
        'x-api-key': request.headers['x-api-key'],
      });
      const claims = provided
        ? verifyUserToken({ secret: sessionSecret, token: provided })
        : null;
      if (!claims) return reply.code(401).send({ error: 'session_invalid' });
      const clientId = readRequestClientId(request.headers);
      const subscription = await getSubscriptionStatusForClient(db, request.authUser.id, clientId);
      return {
        expiresAt: new Date(claims.expiresAtUnix * 1000).toISOString(),
        user: request.authUser,
        subscription,
      };
    }
    return reply.code(401).send({ error: 'session_invalid' });
  });

  app.delete('/v1/auth/account', async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    await db.delete(users).where(eq(users.id, user.id));
    return { ok: true };
  });
}

export function getRequestActorLabel(
  request: FastifyRequest,
  sessionSecret: string,
  apiKeyConfig: ApiKeyConfig,
): string {
  const user = request.authUser ?? resolveAuthUser(request, sessionSecret);
  if (user) {
    const label = formatUserDisplayName(user);
    return label || user.email;
  }
  const provided = extractApiKeyFromHeaders({
    authorization: request.headers.authorization,
    'x-api-key': request.headers['x-api-key'],
  });
  if (matchesApiKey(provided, apiKeyConfig)) return 'api';
  return 'unknown';
}
