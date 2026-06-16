import type { Readable } from 'node:stream';

export type ByteRange = { start: number; end: number };

export interface ObjectStorage {
  ensureReady(): Promise<void>;
  exists(key: string): Promise<boolean>;
  putObject(key: string, body: Buffer, contentType?: string): Promise<void>;
  createReadStream(key: string, range?: ByteRange): Promise<Readable>;
  copyToFile(key: string, destPath: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** S3/MinIO 专用；本地文件存储不挂载该方法 */
  presignedGetUrl?(key: string, expiresInSeconds: number): Promise<string>;
}
