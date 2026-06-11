import { bigint, pgTable, text, timestamp, uuid, integer, primaryKey, } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull().default(''),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
});
export const blobs = pgTable('blobs', {
    id: uuid('id').defaultRandom().primaryKey(),
    contentSha256: text('content_sha256').notNull().unique(),
    storageKey: text('storage_key').notNull().unique(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    mimeType: text('mime_type'),
    originalFilename: text('original_filename'),
    originalExt: text('original_ext'),
    title: text('title'),
    titleEn: text('title_en'),
    titleZhCn: text('title_zh_cn'),
    titleZhTw: text('title_zh_tw'),
    composer: text('composer'),
    author: text('author'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    uploadedBy: text('uploaded_by'),
    updatedBy: text('updated_by'),
});
export const mergeJobs = pgTable('merge_jobs', {
    id: uuid('id').defaultRandom().primaryKey(),
    status: text('status').notNull(),
    progress: integer('progress').notNull().default(0),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    outputKey: text('output_key'),
    webhookUrl: text('webhook_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
});
export const mergeJobInputs = pgTable('merge_job_inputs', {
    jobId: uuid('job_id')
        .notNull()
        .references(() => mergeJobs.id, { onDelete: 'cascade' }),
    blobId: uuid('blob_id')
        .notNull()
        .references(() => blobs.id),
    sortOrder: integer('sort_order').notNull(),
}, (t) => ({
    pk: primaryKey({ columns: [t.jobId, t.sortOrder] }),
}));
//# sourceMappingURL=schema.js.map