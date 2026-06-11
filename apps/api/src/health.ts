import { Redis } from 'ioredis';
import { sql } from 'drizzle-orm';
import type { Db } from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(
  app: FastifyInstance,
  deps: { db: Db; redisUrl: string },
): void {
  app.get('/health', async () => ({ ok: true }));

  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, boolean> = {};

    try {
      await deps.db.execute(sql`SELECT 1`);
      checks.database = true;
    } catch {
      checks.database = false;
    }

    const redis = new Redis(deps.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    try {
      await redis.connect();
      checks.redis = (await redis.ping()) === 'PONG';
    } catch {
      checks.redis = false;
    } finally {
      await redis.quit().catch(() => {});
    }

    const ok = checks.database === true && checks.redis === true;
    return reply.code(ok ? 200 : 503).send({ ok, checks });
  });
}
