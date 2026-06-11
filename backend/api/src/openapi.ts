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
          '演示文稿上传、合并与下载。可选 API Key 鉴权（Authorization: Bearer 或 X-API-Key）。',
        version: '1.0.0',
      },
      servers: [{ url: '/', description: 'Current host' }],
      tags: [
        { name: 'health', description: '健康检查' },
        { name: 'uploads', description: '文件上传' },
        { name: 'jobs', description: '合并任务' },
        { name: 'blobs', description: 'Blob 预览与更新' },
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
        '/v1/uploads': {
          post: {
            tags: ['uploads'],
            summary: '上传单个文件（< 8MB）并保存元数据',
            security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      file: { type: 'string', format: 'binary' },
                      title: { type: 'string' },
                      composer: { type: 'string' },
                      author: { type: 'string' },
                      notes: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'UploadResult { blobId, sha256, deduplicated }' },
              '413': { description: 'file_too_large' },
            },
          },
        },
        '/v1/uploads/init': {
          post: {
            tags: ['uploads'],
            summary: '初始化分片上传',
            security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['filename', 'size'],
                    properties: {
                      filename: { type: 'string' },
                      size: { type: 'integer' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: '{ uploadId, chunkSize, totalChunks }' } },
          },
        },
        '/v1/blobs': {
          get: {
            tags: ['blobs'],
            summary: '搜索已上传的演示文稿元数据',
            security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
            parameters: [
              { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
              { name: 'title', in: 'query', required: false, schema: { type: 'string' } },
              { name: 'composer', in: 'query', required: false, schema: { type: 'string' } },
              { name: 'author', in: 'query', required: false, schema: { type: 'string' } },
              { name: 'limit', in: 'query', required: false, schema: { type: 'integer', maximum: 200, minimum: 1 } },
            ],
            responses: {
              '200': { description: 'List of blobs with metadata' },
            },
          },
        },
        '/v1/jobs': {
          post: {
            tags: ['jobs'],
            summary: '创建合并任务',
            security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['inputs'],
                    properties: {
                      inputs: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['blobId'],
                          properties: {
                            blobId: { type: 'string', format: 'uuid' },
                            order: { type: 'integer' },
                          },
                        },
                      },
                      webhookUrl: {
                        type: 'string',
                        format: 'uri',
                        description: '任务完成（成功/失败）时 POST JSON 通知',
                      },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: '{ jobId, status }' } },
          },
        },
        '/v1/jobs/{id}': {
          get: {
            tags: ['jobs'],
            summary: '查询任务状态',
            security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            ],
            responses: { '200': { description: 'JobResponse' } },
          },
        },
        '/v1/jobs/{id}/download-url': {
          post: {
            tags: ['jobs'],
            summary: '获取签名下载 URL',
            security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            ],
            responses: { '200': { description: '{ url, expiresAt }' } },
          },
        },
        '/v1/jobs/{id}/download': {
          get: {
            tags: ['jobs'],
            summary: '公开下载（需 token 查询参数）',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'PPTX 文件流' } },
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
