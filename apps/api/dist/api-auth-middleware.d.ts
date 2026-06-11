import { type ApiKeyConfig } from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import type { AuthUser } from './auth.js';
export type ApiAuthDeps = {
    sessionSecret: string;
    apiKeyConfig: ApiKeyConfig;
    authRequired: boolean;
    resolveUser: (userId: string) => Promise<AuthUser | null>;
};
export declare function registerApiAuthHooks(app: FastifyInstance, deps: ApiAuthDeps): void;
//# sourceMappingURL=api-auth-middleware.d.ts.map