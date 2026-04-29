import {
  bigint,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const blobs = pgTable('blobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  contentSha256: text('content_sha256').notNull().unique(),
  storageKey: text('storage_key').notNull().unique(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  mimeType: text('mime_type'),
  originalFilename: text('original_filename'),
  originalExt: text('original_ext'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mergeJobs = pgTable('merge_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: text('status').notNull(),
  errorCode: text('error_code'),
  errorDetail: text('error_detail'),
  outputKey: text('output_key'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const mergeJobInputs = pgTable(
  'merge_job_inputs',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => mergeJobs.id, { onDelete: 'cascade' }),
    blobId: uuid('blob_id')
      .notNull()
      .references(() => blobs.id),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.jobId, t.sortOrder] }),
  }),
);

export type BlobRow = typeof blobs.$inferSelect;
export type MergeJobRow = typeof mergeJobs.$inferSelect;
