ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'display_name'
  ) THEN
    UPDATE users
    SET
      first_name = CASE
        WHEN position(' ' in btrim(display_name)) > 0 THEN btrim(substring(display_name from 1 for position(' ' in btrim(display_name)) - 1))
        ELSE btrim(display_name)
      END,
      last_name = CASE
        WHEN position(' ' in btrim(display_name)) > 0 THEN btrim(substring(display_name from position(' ' in btrim(display_name)) + 1))
        ELSE ''
      END
    WHERE first_name IS NULL OR last_name IS NULL;

    ALTER TABLE users DROP COLUMN display_name;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN last_name SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE users DROP COLUMN IF EXISTS display_name;
