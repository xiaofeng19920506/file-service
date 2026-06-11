import type { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  createS3Client,
  ensureBucket,
  objectExists,
  putObjectFromBuffer,
  getObjectStream,
  deleteObject as s3DeleteObject,
  presignedGetUrl as s3PresignedGetUrl,
} from '../s3.js';
import type { ObjectStorage } from './types.js';

export type S3StorageEnv = {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: ReturnType<typeof createS3Client>;

  constructor(
    private readonly env: S3StorageEnv,
    client?: ReturnType<typeof createS3Client>,
  ) {
    this.client =
      client ??
      createS3Client({
        endpoint: env.endpoint,
        region: env.region,
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      });
  }

  async ensureReady(): Promise<void> {
    await ensureBucket(this.client, this.env.bucket);
  }

  exists(key: string): Promise<boolean> {
    return objectExists(this.client, this.env.bucket, key);
  }

  putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
    return putObjectFromBuffer({
      client: this.client,
      bucket: this.env.bucket,
      key,
      body,
      contentType,
    });
  }

  getObjectStream(key: string): Promise<Readable> {
    return getObjectStream({
      client: this.client,
      bucket: this.env.bucket,
      key,
    });
  }

  async createReadStream(key: string): Promise<Readable> {
    return this.getObjectStream(key);
  }

  async copyToFile(key: string, destPath: string): Promise<void> {
    const stream = await this.getObjectStream(key);
    await pipeline(stream, createWriteStream(destPath));
  }

  deleteObject(key: string): Promise<void> {
    return s3DeleteObject({
      client: this.client,
      bucket: this.env.bucket,
      key,
    });
  }

  presignedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    return s3PresignedGetUrl({
      client: this.client,
      bucket: this.env.bucket,
      key,
      expiresInSeconds,
    });
  }
}
