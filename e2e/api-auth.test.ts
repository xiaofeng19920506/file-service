import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import {
  loadApiKeyConfig,
  extractApiKeyFromHeaders,
  verifyApiKey,
  isPublicApiPath,
} from '@file-service/shared';

function createAuthTestApp(apiKey?: string) {
  const app = Fastify();
  const apiKeyConfig = loadApiKeyConfig(apiKey);

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (isPublicApiPath(request.method, path)) return;
    if (!path.startsWith('/v1/')) return;

    const provided = extractApiKeyFromHeaders({
      authorization: request.headers.authorization,
      'x-api-key': request.headers['x-api-key'],
    });
    if (!verifyApiKey(provided, apiKeyConfig)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/health', async () => ({ ok: true }));
  app.get('/v1/ping', async () => ({ pong: true }));

  return app;
}

describe('API auth integration', () => {
  describe('without API_KEY', () => {
    const app = createAuthTestApp();
    beforeAll(() => app.ready());
    afterAll(() => app.close());

    it('GET /health is public', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });

    it('GET /v1/ping works without credentials', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/ping' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('with API_KEY', () => {
    const app = createAuthTestApp('test-secret-key-12345678');
    beforeAll(() => app.ready());
    afterAll(() => app.close());

    it('rejects missing key', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/ping' });
      expect(res.statusCode).toBe(401);
    });

    it('accepts Bearer token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/ping',
        headers: { authorization: 'Bearer test-secret-key-12345678' },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
