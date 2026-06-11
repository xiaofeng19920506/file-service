import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

function resolveStaticRoot(): string | null {
  const staticDir = process.env.STATIC_DIR?.trim();
  if (!staticDir) return null;
  return existsSync(join(staticDir, 'index.html')) ? staticDir : null;
}

/** 生产环境：托管前端构建产物，非 API 路径回退到 SPA index.html */
export async function registerStaticAssets(app: FastifyInstance): Promise<void> {
  const root = resolveStaticRoot();
  if (!root) return;

  await app.register(fastifyStatic, {
    root,
    prefix: '/',
    decorateReply: true,
  });

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (path.startsWith('/v1/') || path === '/health') {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.sendFile('index.html');
  });

  app.log.info({ root }, 'Serving static frontend');
}
