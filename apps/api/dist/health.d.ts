import type { Db } from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
export declare function registerHealthRoutes(app: FastifyInstance, deps: {
    db: Db;
    redisUrl: string;
}): void;
//# sourceMappingURL=health.d.ts.map