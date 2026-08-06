ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS message_pastor_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS message_pastor_invite_sent_for_date text NOT NULL DEFAULT '';
