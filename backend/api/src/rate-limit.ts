import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import {
  extractApiKeyFromHeaders,
  isUploadRateLimitPath,
  shouldSkipRateLimit,
  type ApiEnv,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

export async function registerRateLimiting(
  app: FastifyInstance,
  env: ApiEnv,
): Promise<void> {
  const max = env.RATE_LIMIT_MAX;
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const uploadMax = env.RATE_LIMIT_UPLOAD_MAX;

  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  app.addHook('onClose', async () => {
    await redis.quit();
  });

  await app.register(rateLimit, {
    global: true,
    max,
    timeWindow: windowMs,
    redis,
    skipOnError: true,
    keyGenerator: (request) => {
      const provided = extractApiKeyFromHeaders({
        authorization: request.headers.authorization,
        'x-api-key': request.headers['x-api-key'],
      });
      return provided ?? request.ip;
    },
    allowList: (request) => {
      const path = request.url.split('?')[0] ?? request.url;
      return shouldSkipRateLimit(request.method, path);
    },
  });

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (!isUploadRateLimitPath(request.method, path)) return;

    const key = extractApiKeyFromHeaders({
      authorization: request.headers.authorization,
      'x-api-key': request.headers['x-api-key'],
    });
    const id = key ?? request.ip;
    const redisKey = `upload-ratelimit:${id}`;

    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    }
    if (count > uploadMax) {
      const ttl = await redis.pttl(redisKey);
      reply.header('Retry-After', Math.ceil(Math.max(ttl, 0) / 1000));
      return reply.code(429).send({ error: 'rate_limit_exceeded' });
    }
  });
}
