CREATE TABLE IF NOT EXISTS bulletin_scripture_preferences (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bulletin_id uuid NOT NULL REFERENCES weekly_bulletins(id) ON DELETE CASCADE,
  scripture_book text NOT NULL DEFAULT '',
  scripture_reference text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, bulletin_id)
);

CREATE INDEX IF NOT EXISTS bulletin_scripture_preferences_expires_idx
  ON bulletin_scripture_preferences (expires_at);
