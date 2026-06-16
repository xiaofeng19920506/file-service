import {
  bigint,
  boolean,
  date,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull().default(''),
  role: text('role').notNull().default('member'),
  premiumTrialEndsAt: timestamp('premium_trial_ends_at', { withTimezone: true }),
  phone: text('phone').notNull().default(''),
  addressLine1: text('address_line1').notNull().default(''),
  addressLine2: text('address_line2').notNull().default(''),
  city: text('city').notNull().default(''),
  stateProvince: text('state_province').notNull().default(''),
  postalCode: text('postal_code').notNull().default(''),
  country: text('country').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userLoginDevices = pgTable('user_login_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  deviceKeyHash: text('device_key_hash').notNull().unique(),
  deviceName: text('device_name').notNull(),
  platform: text('platform').notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRole = 'member' | 'worship_team' | 'creator' | 'admin' | 'vip';

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

export const playlists = pgTable('playlists', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  sourceUrl: text('source_url').notNull(),
  youtubePlaylistId: text('youtube_playlist_id'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const playlistItems = pgTable('playlist_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  playlistId: uuid('playlist_id')
    .notNull()
    .references(() => playlists.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
  title: text('title').notNull(),
  youtubeVideoId: text('youtube_video_id').notNull(),
  youtubeUrl: text('youtube_url').notNull(),
  blobId: uuid('blob_id').references(() => blobs.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const youtubeOAuthConnections = pgTable('youtube_oauth_connections', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  googleAccountEmail: text('google_account_email'),
  channelTitle: text('channel_title'),
  refreshToken: text('refresh_token').notNull(),
  accessToken: text('access_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  scopes: text('scopes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type YoutubeAudioCacheStatus = 'pending' | 'processing' | 'ready' | 'failed';

export const youtubeAudioCache = pgTable('youtube_audio_cache', {
  youtubeVideoId: text('youtube_video_id').primaryKey(),
  status: text('status').notNull().default('pending'),
  blobId: uuid('blob_id').references(() => blobs.id, { onDelete: 'set null' }),
  title: text('title'),
  errorCode: text('error_code'),
  errorDetail: text('error_detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const youtubeVideoCache = pgTable('youtube_video_cache', {
  youtubeVideoId: text('youtube_video_id').primaryKey(),
  status: text('status').notNull().default('pending'),
  blobId: uuid('blob_id').references(() => blobs.id, { onDelete: 'set null' }),
  title: text('title'),
  errorCode: text('error_code'),
  errorDetail: text('error_detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type YoutubeVideoCacheStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type YoutubeVideoCacheRow = typeof youtubeVideoCache.$inferSelect;

export const youtubeVideoDailyPlays = pgTable(
  'youtube_video_daily_plays',
  {
    playDate: date('play_date').notNull(),
    youtubeVideoId: text('youtube_video_id').notNull(),
    title: text('title').notNull(),
    channelTitle: text('channel_title'),
    playCount: integer('play_count').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.playDate, t.youtubeVideoId] }),
  }),
);

export const userSubscriptions = pgTable('user_subscriptions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('apple'),
  productId: text('product_id').notNull(),
  originalTransactionId: text('original_transaction_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  environment: text('environment').notNull().default('production'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const weeklyBulletins = pgTable('weekly_bulletins', {
  id: uuid('id').defaultRandom().primaryKey(),
  serviceDate: date('service_date').notNull(),
  serviceTime: text('service_time').notNull().default('11:00'),
  status: text('status').notNull().default('draft'),
  lastWeekOfferingDate: text('last_week_offering_date').notNull().default(''),
  offeringQuarterLabel: text('offering_quarter_label').notNull().default(''),
  birthdayMonth: text('birthday_month').notNull().default(''),
  birthdayNames: text('birthday_names').notNull().default(''),
  staffMeetingDate: text('staff_meeting_date').notNull().default(''),
  testimonyShareDate: text('testimony_share_date').notNull().default(''),
  serviceRosterText: text('service_roster_text').notNull().default(''),
  baptismText: text('baptism_text').notNull().default(''),
  scriptureBook: text('scripture_book').notNull().default(''),
  scriptureReference: text('scripture_reference').notNull().default(''),
  verseOfWeek: text('verse_of_week').notNull().default(''),
  weeklyMeetingVariant: integer('weekly_meeting_variant'),
  skipTestimonyWeek: boolean('skip_testimony_week').notNull().default(false),
  skipDepartmentReports: boolean('skip_department_reports').notNull().default(false),
  servicePlaylistId: uuid('service_playlist_id').references(() => playlists.id, { onDelete: 'set null' }),
  outputBlobId: uuid('output_blob_id').references(() => blobs.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const bulletinAnnouncements = pgTable('bulletin_announcements', {
  id: uuid('id').defaultRandom().primaryKey(),
  bulletinId: uuid('bulletin_id')
    .notNull()
    .references(() => weeklyBulletins.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
  category: text('category').notNull().default('general'),
  title: text('title').notNull().default(''),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bulletinScripturePreferences = pgTable(
  'bulletin_scripture_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bulletinId: uuid('bulletin_id')
      .notNull()
      .references(() => weeklyBulletins.id, { onDelete: 'cascade' }),
    scriptureBook: text('scripture_book').notNull().default(''),
    scriptureReference: text('scripture_reference').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.bulletinId] }),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type UserLoginDeviceRow = typeof userLoginDevices.$inferSelect;
export type BlobRow = typeof blobs.$inferSelect;
export type MergeJobRow = typeof mergeJobs.$inferSelect;
export type PlaylistRow = typeof playlists.$inferSelect;
export type PlaylistItemRow = typeof playlistItems.$inferSelect;
export type YoutubeAudioCacheRow = typeof youtubeAudioCache.$inferSelect;
export type YoutubeVideoDailyPlayRow = typeof youtubeVideoDailyPlays.$inferSelect;
export type YoutubeOAuthConnectionRow = typeof youtubeOAuthConnections.$inferSelect;
export type UserSubscriptionRow = typeof userSubscriptions.$inferSelect;
export type WeeklyBulletinRow = typeof weeklyBulletins.$inferSelect;
export type BulletinAnnouncementRow = typeof bulletinAnnouncements.$inferSelect;
export type BulletinScripturePreferenceRow = typeof bulletinScripturePreferences.$inferSelect;
