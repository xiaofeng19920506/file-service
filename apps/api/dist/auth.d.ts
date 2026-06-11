import { type ApiEnv, type ApiKeyConfig, type Db, type UserRole } from '@file-service/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
export type AuthUser = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
};
declare module 'fastify' {
    interface FastifyRequest {
        authUser?: AuthUser;
        apiKeyAuth?: boolean;
    }
}
export declare function hashPassword(password: string): string;
export declare function verifyPassword(password: string, stored: string): boolean;
export declare function resolveAuthUser(request: FastifyRequest, sessionSecret: string): AuthUser | undefined;
export declare function registerAuthRoutes(app: FastifyInstance, deps: {
    db: Db;
    env: ApiEnv;
    apiKeyConfig: ApiKeyConfig;
}): void;
export declare function getRequestActorLabel(request: FastifyRequest, sessionSecret: string, apiKeyConfig: ApiKeyConfig): string;
//# sourceMappingURL=auth.d.ts.map