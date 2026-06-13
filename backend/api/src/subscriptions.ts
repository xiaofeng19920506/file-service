import type { FastifyInstance } from 'fastify';
import {
  getSubscriptionStatusForClient,
  upsertUserSubscription,
  verifyAppleTransaction,
  readRequestClientId,
  type ApiEnv,
  type Db,
} from '@file-service/shared';

export function registerSubscriptionRoutes(
  app: FastifyInstance,
  deps: { db: Db; env: ApiEnv },
): void {
  const { db, env } = deps;

  app.get('/v1/subscription', async (request, reply) => {
    const user = request.authUser;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const clientId = readRequestClientId(request.headers);
    return getSubscriptionStatusForClient(db, user.id, clientId);
  });

  app.post<{ Body: { transactionId?: string; productId?: string } }>(
    '/v1/subscription/apple',
    async (request, reply) => {
      const user = request.authUser;
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      const transactionId = request.body?.transactionId?.trim();
      if (!transactionId) return reply.code(400).send({ error: 'invalid_transaction' });

      try {
        const verified = await verifyAppleTransaction(env, transactionId);
        await upsertUserSubscription(db, user.id, verified);
        const clientId = readRequestClientId(request.headers);
        return getSubscriptionStatusForClient(db, user.id, clientId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'iap_verify_failed';
        if (msg === 'iap_not_configured') {
          return reply.code(503).send({ error: 'iap_not_configured' });
        }
        if (msg === 'invalid_transaction' || msg === 'invalid_apple_transaction') {
          return reply.code(400).send({ error: msg });
        }
        request.log.error(e, 'apple subscription verify failed');
        return reply.code(502).send({ error: 'iap_verify_failed' });
      }
    },
  );
}
