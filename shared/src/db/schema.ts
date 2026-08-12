import {
  bigint,
  boolean,
  date,
  jsonb,
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
  role: text('role').notNull().default('user'),
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

export type UserRole = 'admin' | 'user';

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
  /** 可选：只播放片段起点（秒）；多段时与 playClips[0] 同步 */
  playStartSec: integer('play_start_sec'),
  /** 可选：片段终点（秒，需 > playStartSec） */
  playEndSec: integer('play_end_sec'),
  /** 可选：多段剪切 [{ startSec, endSec, label? }, ...] */
  playClips: jsonb('play_clips').$type<
    { startSec: number; endSec: number | null; label?: string | null }[] | null
  >(),
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
  expectedBytes: bigint('expected_bytes', { mode: 'number' }),
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

export const youtubeUserPlays = pgTable('youtube_user_plays', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  youtubeVideoId: text('youtube_video_id').notNull(),
  title: text('title').notNull(),
  channelTitle: text('channel_title'),
  playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
});

export const youtubeUserSearches = pgTable('youtube_user_searches', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  searchedAt: timestamp('searched_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  status: text('status').notNull().default('ready'),
  lastWeekOfferingDate: text('last_week_offering_date').notNull().default(''),
  offeringQuarterLabel: text('offering_quarter_label').notNull().default(''),
  /** 十一奉献金额（存两位小数字符串，如 3260.00） */
  offeringTitheAmount: text('offering_tithe_amount').notNull().default(''),
  /** 其他奉献金额 */
  offeringOtherAmount: text('offering_other_amount').notNull().default(''),
  /** 奉献总数 = 十一 + 其他（后端计算写入） */
  offeringTotalAmount: text('offering_total_amount').notNull().default(''),
  birthdayMonth: text('birthday_month').notNull().default(''), // "1"…"12"
  /** JSON：{ "1": "甲\\n乙", ... }；兼容旧扁平名单字符串 */
  birthdayNames: text('birthday_names').notNull().default(''),
  /** 会前祷告是否在第 2 页显示主席姓名 */
  showPreServiceChairName: boolean('show_pre_service_chair_name').notNull().default(false),
  /** 主席姓名（勾选显示时写入第 2 页；第 3 页名单页会从 deck 删除） */
  preServiceChairNames: text('pre_service_chair_names').notNull().default(''),
  staffMeetingDate: text('staff_meeting_date').notNull().default(''),
  /** 同工会页眉：年份，如 2026 →「2026年6」 */
  staffMeetingYear: text('staff_meeting_year').notNull().default(''),
  /** 同工会页眉：月份数字，如 6 */
  staffMeetingMonth: text('staff_meeting_month').notNull().default(''),
  /** 同工会开始时间，如 12:45 pm */
  staffMeetingStartTime: text('staff_meeting_start_time').notNull().default(''),
  /** 同工会结束时间，如 2:00 pm */
  staffMeetingEndTime: text('staff_meeting_end_time').notNull().default(''),
  testimonyShareDate: text('testimony_share_date').notNull().default(''),
  /** 今日清洁人员（换行分隔）；写入 P34 textIndex 1 */
  serviceRosterText: text('service_roster_text').notNull().default(''),
  /** 今日清洁标题日期，如 6/14 →「今日(6/14)清潔輪值」 */
  serviceRosterTodayDate: text('service_roster_today_date').notNull().default(''),
  /** 下主日服事标题日期，如 6/21 →「下主日(6/21)服事輪值」 */
  serviceRosterNextDate: text('service_roster_next_date').notNull().default(''),
  serviceRosterChair: text('service_roster_chair').notNull().default(''),
  serviceRosterWorship: text('service_roster_worship').notNull().default(''),
  serviceRosterUsher: text('service_roster_usher').notNull().default(''),
  /** 下主日清洁人员（换行分隔） */
  serviceRosterCleanNames: text('service_roster_clean_names').notNull().default(''),
  /** 服事轮值表 P32：季度开始月份，如 7 */
  rotationStartMonth: text('rotation_start_month').notNull().default(''),
  /** 服事轮值表 P32：季度结束月份，如 9 */
  rotationEndMonth: text('rotation_end_month').notNull().default(''),
  baptismText: text('baptism_text').notNull().default(''),
  scriptureBook: text('scripture_book').notNull().default(''),
  scriptureReference: text('scripture_reference').notNull().default(''),
  verseOfWeek: text('verse_of_week').notNull().default(''),
  weeklyMeetingVariant: integer('weekly_meeting_variant'),
  /** 自定义本週聚会模版列表（本周报内） */
  weeklyMeetingTemplates: jsonb('weekly_meeting_templates')
    .$type<{ id: string; label: string; blobId: string }[]>()
    .notNull()
    .default([]),
  /** 选中的自定义模版 id；有值时优先于 weeklyMeetingVariant */
  weeklyMeetingTemplateId: text('weekly_meeting_template_id'),
  skipTestimonyWeek: boolean('skip_testimony_week').notNull().default(false),
  skipDepartmentReports: boolean('skip_department_reports').notNull().default(false),
  /** 不进入 PPT / 预览的分区 id 列表（与 BULLETIN_NAV_SECTIONS id 对齐） */
  hiddenSections: jsonb('hidden_sections').$type<string[]>().notNull().default([]),
  /**
   * 各分区幻灯片文字覆盖（只改文字 run，不改背景/图片）。
   * 形如 [{ slide: 8, textIndex: 0, text: "敬拜讚美" }, ...]
   */
  slideTextOverrides: jsonb('slide_text_overrides')
    .$type<{ slide: number; textIndex: number; text: string }[]>()
    .notNull()
    .default([]),
  /**
   * 分区迷你 PPTX 覆盖：sectionId → blobId。
   * 有值时该分区以二进制页为准（预览/导出 splice）。
   */
  sectionPptxOverrides: jsonb('section_pptx_overrides')
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  /** 主日信息：牧师邮箱；每周一自动发上传邀请（可选） */
  messagePastorEmail: text('message_pastor_email').notNull().default(''),
  /** 已为哪个 serviceDate 发过周一邀请，避免重复 */
  messagePastorInviteSentForDate: text('message_pastor_invite_sent_for_date').notNull().default(''),
  /** 本週金句：牧师邮箱；每周一自动发填写邀请（可选） */
  versePastorEmail: text('verse_pastor_email').notNull().default(''),
  versePastorInviteSentForDate: text('verse_pastor_invite_sent_for_date').notNull().default(''),
  servicePlaylistId: uuid('service_playlist_id').references(() => playlists.id, { onDelete: 'set null' }),
  /** 敬拜赞美投影格式：ppt | youtube | ppt_youtube */
  worshipPresentationMode: text('worship_presentation_mode').notNull().default('youtube'),
  /** 敬拜赞美歌词 PPT（用户上传，投影时音乐在后台） */
  worshipLyricsPptxBlobId: uuid('worship_lyrics_pptx_blob_id').references(() => blobs.id, {
    onDelete: 'set null',
  }),
  /** 三一颂背景播放用 YouTube video id（幻灯片上点播放，仅音频）；空则用本堂默认 */
  doxologyYoutubeVideoId: text('doxology_youtube_video_id').notNull().default('89zSBB5RUuM'),
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
