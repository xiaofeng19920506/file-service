import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'file-service API',
        description:
          'YouTube MP3 播放器 API。可选 API Key 鉴权（Authorization: Bearer 或 X-API-Key）。',
        version: '1.0.0',
      },
      servers: [{ url: '/', description: 'Current host' }],
      tags: [
        { name: 'health', description: '健康检查' },
        { name: 'auth', description: '登录与会话' },
        { name: 'playlists', description: '播放列表' },
        { name: 'youtube', description: 'YouTube 音频 / 搜索 / 字幕' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
          apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
      paths: {
        '/health': {
          get: {
            tags: ['health'],
            summary: '存活探针',
            responses: { '200': { description: 'OK' } },
          },
        },
        '/ready': {
          get: {
            tags: ['health'],
            summary: '就绪探针（DB + Redis）',
            responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } },
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
}
