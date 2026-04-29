import { z } from 'zod';

const retention = z.coerce.number().int().positive().default(7);

const apiFs = z.object({
  STORAGE_BACKEND: z.literal('fs'),
  LOCAL_STORAGE_DIR: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  EXPORT_RETENTION_DAYS: retention,
  DOWNLOAD_HMAC_SECRET: z.string().min(16),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  PORT: z.coerce.number().int().positive().default(3000),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(200),
  PUBLIC_BASE_URL: z.string().url().optional(),
});

const apiS3 = z.object({
  STORAGE_BACKEND: z.literal('s3'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  EXPORT_RETENTION_DAYS: retention,
  DOWNLOAD_HMAC_SECRET: z.string().min(16),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  PORT: z.coerce.number().int().positive().default(3000),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(200),
  PUBLIC_BASE_URL: z.string().url().optional(),
});

export const apiSchema = z.discriminatedUnion('STORAGE_BACKEND', [
  apiFs,
  apiS3,
]);

export type ApiEnv = z.infer<typeof apiSchema>;

export function loadApiEnv(processEnv: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = apiSchema.safeParse(processEnv);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

const workerFs = z.object({
  STORAGE_BACKEND: z.literal('fs'),
  LOCAL_STORAGE_DIR: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  EXPORT_RETENTION_DAYS: retention,
  SOFFICE_PATH: z.string().default('soffice'),
});

const workerS3 = z.object({
  STORAGE_BACKEND: z.literal('s3'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  EXPORT_RETENTION_DAYS: retention,
  SOFFICE_PATH: z.string().default('soffice'),
});

export const workerSchema = z.discriminatedUnion('STORAGE_BACKEND', [
  workerFs,
  workerS3,
]);

export type WorkerEnv = z.infer<typeof workerSchema>;

export function loadWorkerEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): WorkerEnv {
  const parsed = workerSchema.safeParse(processEnv);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const MERGE_QUEUE_NAME = 'merge-presentation';
