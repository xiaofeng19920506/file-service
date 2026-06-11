import type { FastifyInstance, FastifyRequest } from 'fastify';
import { type Db } from '@file-service/shared';
import type { ObjectStorage } from '@file-service/shared';
export declare function sweepExpiredUploadSessions(): Promise<void>;
export declare function registerChunkUploadRoutes(app: FastifyInstance, deps: {
    db: Db;
    storage: ObjectStorage;
    maxUploadBytes: number;
    getActor: (request: FastifyRequest) => string;
}): void;
//# sourceMappingURL=chunk-upload.d.ts.map