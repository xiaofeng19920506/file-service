import type { Readable } from 'node:stream';
import { createS3Client } from '../s3.js';
import type { ObjectStorage } from './types.js';
export type S3StorageEnv = {
    endpoint?: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
};
export declare class S3ObjectStorage implements ObjectStorage {
    private readonly env;
    private readonly client;
    constructor(env: S3StorageEnv, client?: ReturnType<typeof createS3Client>);
    ensureReady(): Promise<void>;
    exists(key: string): Promise<boolean>;
    putObject(key: string, body: Buffer, contentType?: string): Promise<void>;
    getObjectStream(key: string): Promise<Readable>;
    createReadStream(key: string): Promise<Readable>;
    copyToFile(key: string, destPath: string): Promise<void>;
    deleteObject(key: string): Promise<void>;
    presignedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
}
//# sourceMappingURL=s3-storage.d.ts.map