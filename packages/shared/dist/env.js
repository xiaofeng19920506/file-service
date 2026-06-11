import { z } from 'zod';
const retention = z.coerce.number().int().positive().default(7);
const apiKeyField = z.string().min(8).optional();
/** 60 年（按 365 天/年计算） */
export const USER_SESSION_TTL_60_YEARS_SECONDS = 60 * 365 * 24 * 60 * 60;
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
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().positive().default(30),
    PUBLIC_BASE_URL: z.string().url().optional(),
    SOFFICE_PATH: z.string().default('soffice'),
    API_KEY: apiKeyField,
    AUTH_REQUIRED: z
        .enum(['true', 'false', '1', '0'])
        .default('true')
        .transform((v) => v === 'true' || v === '1'),
    USER_SESSION_TTL_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .default(USER_SESSION_TTL_60_YEARS_SECONDS),
    ADMIN_EMAILS: z.string().optional(),
    WORSHIP_TEAM_EMAILS: z.string().optional(),
    WEBHOOK_SECRET: z.string().min(8).optional(),
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
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().positive().default(30),
    PUBLIC_BASE_URL: z.string().url().optional(),
    SOFFICE_PATH: z.string().default('soffice'),
    API_KEY: apiKeyField,
    AUTH_REQUIRED: z
        .enum(['true', 'false', '1', '0'])
        .default('true')
        .transform((v) => v === 'true' || v === '1'),
    USER_SESSION_TTL_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .default(USER_SESSION_TTL_60_YEARS_SECONDS),
    ADMIN_EMAILS: z.string().optional(),
    WORSHIP_TEAM_EMAILS: z.string().optional(),
    WEBHOOK_SECRET: z.string().min(8).optional(),
});
export const apiSchema = z.discriminatedUnion('STORAGE_BACKEND', [
    apiFs,
    apiS3,
]);
export function loadApiEnv(processEnv = process.env) {
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
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
    WEBHOOK_SECRET: z.string().min(8).optional(),
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
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
    WEBHOOK_SECRET: z.string().min(8).optional(),
});
export const workerSchema = z.discriminatedUnion('STORAGE_BACKEND', [
    workerFs,
    workerS3,
]);
export function loadWorkerEnv(processEnv = process.env) {
    const parsed = workerSchema.safeParse(processEnv);
    if (!parsed.success) {
        throw new Error(`Invalid env: ${parsed.error.message}`);
    }
    return parsed.data;
}
export const MERGE_QUEUE_NAME = 'merge-presentation';
//# sourceMappingURL=env.js.map