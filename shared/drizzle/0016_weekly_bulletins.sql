-- 教会周报：按主日管理日期、公告与幻灯片配置

CREATE TABLE IF NOT EXISTS weekly_bulletins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date date NOT NULL,
  service_time text NOT NULL DEFAULT '11:00',
  status text NOT NULL DEFAULT 'draft',
  last_week_offering_date text NOT NULL DEFAULT '',
  offering_quarter_label text NOT NULL DEFAULT '',
  birthday_month text NOT NULL DEFAULT '',
  birthday_names text NOT NULL DEFAULT '',
  staff_meeting_date text NOT NULL DEFAULT '',
  testimony_share_date text NOT NULL DEFAULT '',
  service_roster_text text NOT NULL DEFAULT '',
  baptism_text text NOT NULL DEFAULT '',
  weekly_meeting_variant integer,
  skip_testimony_week boolean NOT NULL DEFAULT false,
  skip_department_reports boolean NOT NULL DEFAULT false,
  output_blob_id uuid REFERENCES blobs(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_bulletins_service_date_uidx
  ON weekly_bulletins (service_date);

CREATE TABLE IF NOT EXISTS bulletin_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id uuid NOT NULL REFERENCES weekly_bulletins(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bulletin_announcements_bulletin_id_idx
  ON bulletin_announcements (bulletin_id, sort_order);
