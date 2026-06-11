import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createS3Client, ensureBucket, objectExists, putObjectFromBuffer, getObjectStream, deleteObject as s3DeleteObject, presignedGetUrl as s3PresignedGetUrl, } from '../s3.js';
export class S3ObjectStorage {
    env;
    client;
    constructor(env, client) {
        this.env = env;
        this.client =
            client ??
                createS3Client({
                    endpoint: env.endpoint,
                    region: env.region,
                    accessKeyId: env.accessKeyId,
                    secretAccessKey: env.secretAccessKey,
                });
    }
    async ensureReady() {
        await ensureBucket(this.client, this.env.bucket);
    }
    exists(key) {
        return objectExists(this.client, this.env.bucket, key);
    }
    putObject(key, body, contentType) {
        return putObjectFromBuffer({
            client: this.client,
            bucket: this.env.bucket,
            key,
            body,
            contentType,
        });
    }
    getObjectStream(key) {
        return getObjectStream({
            client: this.client,
            bucket: this.env.bucket,
            key,
        });
    }
    async createReadStream(key) {
        return this.getObjectStream(key);
    }
    async copyToFile(key, destPath) {
        const stream = await this.getObjectStream(key);
        await pipeline(stream, createWriteStream(destPath));
    }
    deleteObject(key) {
        return s3DeleteObject({
            client: this.client,
            bucket: this.env.bucket,
            key,
        });
    }
    presignedGetUrl(key, expiresInSeconds) {
        return s3PresignedGetUrl({
            client: this.client,
            bucket: this.env.bucket,
            key,
            expiresInSeconds,
        });
    }
}
//# sourceMappingURL=s3-storage.js.map