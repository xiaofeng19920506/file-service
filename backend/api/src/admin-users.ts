import { desc, eq, sql } from 'drizzle-orm';
import {
  isValidPersonName,
  isValidUserRole,
  normalizeUserRole,
  users,
  type Db,
  type UserRole,
  type UserRow,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

function publicUserPayload(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: normalizeUserRole(row.role),
    createdAt: row.createdAt.toISOString(),
  };
}

async function countAdmins(db: Db): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, 'admin'));
  return count;
}

export function registerAdminUserRoutes(app: FastifyInstance, deps: { db: Db }): void {
  const { db } = deps;

  app.get('/v1/admin/users', async () => {
    const rows = await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));
    return { users: rows.map(publicUserPayload) };
  });

  app.patch<{
    Params: { id: string };
    Body: { role?: string; firstName?: string; lastName?: string };
  }>('/v1/admin/users/:id', async (request, reply) => {
    const targetId = request.params.id;
    const body = request.body ?? {};
    const actorId = request.authUser?.id;

    const [target] = await db.select().from(users).where(eq(users.id, targetId));
    if (!target) return reply.code(404).send({ error: 'user_not_found' });

    const patch: { role?: UserRole; firstName?: string; lastName?: string } = {};

    if (body.firstName !== undefined) {
      const firstName = body.firstName.trim();
      if (!isValidPersonName(firstName)) {
        return reply.code(400).send({ error: 'invalid_first_name' });
      }
      patch.firstName = firstName;
    }

    if (body.lastName !== undefined) {
      const lastName = body.lastName.trim();
      if (!isValidPersonName(lastName)) {
        return reply.code(400).send({ error: 'invalid_last_name' });
      }
      patch.lastName = lastName;
    }

    if (body.role !== undefined) {
      if (actorId && actorId === targetId) {
        return reply.code(403).send({ error: 'cannot_change_own_role' });
      }
      if (!isValidUserRole(body.role)) {
        return reply.code(400).send({ error: 'invalid_role' });
      }
      const currentRole = normalizeUserRole(target.role);
      if (currentRole === 'admin' && body.role !== 'admin') {
        const adminCount = await countAdmins(db);
        if (adminCount <= 1) {
          return reply.code(403).send({ error: 'last_admin_required' });
        }
      }
      patch.role = body.role;
    }

    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: 'no_changes' });
    }

    const [row] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, targetId))
      .returning();

    return { user: publicUserPayload(row) };
  });
}
