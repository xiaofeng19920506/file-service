import type { ApiKeyConfig } from '@file-service/shared';
import type { FastifyRequest } from 'fastify';
import { getRequestActorLabel } from './auth.js';

export function resolveRequestActor(opts: {
  request: FastifyRequest;
  sessionSecret: string;
  apiKeyConfig: ApiKeyConfig;
}): string {
  return getRequestActorLabel(opts.request, opts.sessionSecret, opts.apiKeyConfig);
}
