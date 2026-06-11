import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand, } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export function createS3Client(opts) {
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
export async function ensureBucket(client, bucket) {
    try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
    }
    catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
}
export async function objectExists(client, bucket, key) {
    try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    }
    catch {
        return false;
    }
}
export async function putObjectFromBuffer(opts) {
    await opts.client.send(new PutObjectCommand({
        Bucket: opts.bucket,
        Key: opts.key,
        Body: opts.body,
        ContentType: opts.contentType,
    }));
}
export async function getObjectStream(opts) {
    const out = await opts.client.send(new GetObjectCommand({ Bucket: opts.bucket, Key: opts.key }));
    if (!out.Body) {
        throw new Error('S3 GetObject returned empty body');
    }
    return out.Body;
}
export async function deleteObject(opts) {
    await opts.client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: opts.key }));
}
export async function presignedGetUrl(opts) {
    const cmd = new GetObjectCommand({
        Bucket: opts.bucket,
        Key: opts.key,
    });
    return getSignedUrl(opts.client, cmd, {
        expiresIn: opts.expiresInSeconds,
    });
}
//# sourceMappingURL=s3.js.map