-- 本週金句：牧师邮箱邀请填写

ALTER TABLE weekly_bulletins
  ADD COLUMN IF NOT EXISTS verse_pastor_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verse_pastor_invite_sent_for_date text NOT NULL DEFAULT '';
