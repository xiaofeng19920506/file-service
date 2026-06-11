import { type ApiEnv, type ApiKeyConfig } from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
export type AdminConfig = {
    enabled: boolean;
    password: string | undefined;
    sessionTtlSeconds: number;
};
export declare function loadAdminConfig(env: ApiEnv): AdminConfig;
export declare function isAuthorizedRequest(opts: {
    provided: string | undefined;
    apiKeyConfig: ApiKeyConfig;
    sessionSecret: string;
}): boolean;
export declare function hasAdminSession(opts: {
    provided: string | undefined;
    sessionSecret: string;
}): boolean;
export declare function registerAdminRoutes(app: FastifyInstance, deps: {
    adminConfig: AdminConfig;
    apiKeyConfig: ApiKeyConfig;
    sessionSecret: string;
}): void;
//# sourceMappingURL=admin-auth.d.ts.map