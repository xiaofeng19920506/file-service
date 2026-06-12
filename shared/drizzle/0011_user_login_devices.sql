CREATE TABLE IF NOT EXISTS "user_login_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_key_hash" text NOT NULL UNIQUE,
  "device_name" text NOT NULL,
  "platform" text NOT NULL,
  "last_login_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_login_devices_user_id_idx" ON "user_login_devices" ("user_id");
