import {
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  originalName: text("original_name").notNull(),
  storageKey: text("storage_key").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  mimeType: text("mime_type"),
  source: varchar("source", { length: 32 }).notNull().default("direct"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  totalSize: bigint("total_size", { mode: "number" }).notNull(),
  totalChunks: integer("total_chunks").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("uploading"),
  mergedFileId: uuid("merged_file_id").references(() => files.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const filesRelations = relations(files, () => ({}));
export const uploadSessionsRelations = relations(uploadSessions, ({ one }) => ({
  mergedFile: one(files, {
    fields: [uploadSessions.mergedFileId],
    references: [files.id],
  }),
}));
