import { S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
export declare function createS3Client(opts: {
    endpoint?: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
}): S3Client;
export declare function ensureBucket(client: S3Client, bucket: string): Promise<void>;
export declare function objectExists(client: S3Client, bucket: string, key: string): Promise<boolean>;
export declare function putObjectFromBuffer(opts: {
    client: S3Client;
    bucket: string;
    key: string;
    body: Buffer;
    contentType?: string;
}): Promise<void>;
export declare function getObjectStream(opts: {
    client: S3Client;
    bucket: string;
    key: string;
}): Promise<Readable>;
export declare function deleteObject(opts: {
    client: S3Client;
    bucket: string;
    key: string;
}): Promise<void>;
export declare function presignedGetUrl(opts: {
    client: S3Client;
    bucket: string;
    key: string;
    expiresInSeconds: number;
}): Promise<string>;
//# sourceMappingURL=s3.d.ts.map