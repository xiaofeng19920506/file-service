-- users 表由 Drizzle 迁移 0005–0007 创建，勿在此预建（避免与 display_name 迁移冲突）

CREATE TABLE IF NOT EXISTS blobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  content_sha256 text NOT NULL UNIQUE,
  storage_key text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL,
  mime_type text,
  original_filename text,
  original_ext text,
  title text,
  title_en text,
  title_zh_cn text,
  title_zh_tw text,
  composer text,
  author text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  uploaded_by text,
  updated_by text
);

CREATE TABLE IF NOT EXISTS merge_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  status text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  error_code text,
  error_detail text,
  output_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS merge_job_inputs (
  job_id uuid NOT NULL REFERENCES merge_jobs(id) ON DELETE CASCADE,
  blob_id uuid NOT NULL REFERENCES blobs(id),
  sort_order integer NOT NULL,
  PRIMARY KEY (job_id, sort_order)
);

CREATE INDEX IF NOT EXISTS merge_jobs_expires_idx
  ON merge_jobs (expires_at)
  WHERE output_key IS NOT NULL;
