ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "premium_trial_ends_at" timestamptz;
