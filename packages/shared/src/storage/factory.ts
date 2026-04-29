import type { ApiEnv } from '../env.js';
import type { WorkerEnv } from '../env.js';
import { FsObjectStorage } from './fs-storage.js';
import { S3ObjectStorage } from './s3-storage.js';
import type { ObjectStorage } from './types.js';

export function createObjectStorage(
  env: ApiEnv | WorkerEnv,
): ObjectStorage {
  if (env.STORAGE_BACKEND === 'fs') {
    return new FsObjectStorage(env.LOCAL_STORAGE_DIR);
  }
  return new S3ObjectStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET,
  });
}
