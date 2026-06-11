import type { Readable } from 'node:stream';
import type { ObjectStorage } from './types.js';
export declare class FsObjectStorage implements ObjectStorage {
    private readonly rootDir;
    constructor(rootDir: string);
    ensureReady(): Promise<void>;
    exists(key: string): Promise<boolean>;
    putObject(key: string, body: Buffer, _contentType?: string): Promise<void>;
    createReadStream(key: string): Promise<Readable>;
    copyToFile(key: string, destPath: string): Promise<void>;
    deleteObject(key: string): Promise<void>;
}
//# sourceMappingURL=fs-storage.d.ts.map