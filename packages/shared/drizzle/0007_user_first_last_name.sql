ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN last_name SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE users DROP COLUMN IF EXISTS display_name;
