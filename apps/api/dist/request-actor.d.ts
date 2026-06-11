import type { ApiKeyConfig } from '@file-service/shared';
import type { FastifyRequest } from 'fastify';
export declare function resolveRequestActor(opts: {
    request: FastifyRequest;
    sessionSecret: string;
    apiKeyConfig: ApiKeyConfig;
}): string;
//# sourceMappingURL=request-actor.d.ts.map