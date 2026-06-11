CREATE TABLE IF NOT EXISTS youtube_oauth_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_account_email text,
  channel_title text,
  refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  scopes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
