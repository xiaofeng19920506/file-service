import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

export function createS3Client(opts: {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  return new S3Client({
    region: opts.region,
    endpoint: opts.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    },
  });
}

export async function ensureBucket(
  client: S3Client,
  bucket: string,
): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function objectExists(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function putObjectFromBuffer(opts: {
  client: S3Client;
  bucket: string;
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<void> {
  await opts.client.send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );
}

export async function getObjectStream(opts: {
  client: S3Client;
  bucket: string;
  key: string;
}): Promise<Readable> {
  const out = await opts.client.send(
    new GetObjectCommand({ Bucket: opts.bucket, Key: opts.key }),
  );
  if (!out.Body) {
    throw new Error('S3 GetObject returned empty body');
  }
  return out.Body as Readable;
}

export async function deleteObject(opts: {
  client: S3Client;
  bucket: string;
  key: string;
}): Promise<void> {
  await opts.client.send(
    new DeleteObjectCommand({ Bucket: opts.bucket, Key: opts.key }),
  );
}

export async function presignedGetUrl(opts: {
  client: S3Client;
  bucket: string;
  key: string;
  expiresInSeconds: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: opts.bucket,
    Key: opts.key,
  });
  return getSignedUrl(opts.client, cmd, {
    expiresIn: opts.expiresInSeconds,
  });
}
