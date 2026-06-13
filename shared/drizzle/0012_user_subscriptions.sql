CREATE TABLE IF NOT EXISTS "user_subscriptions" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL DEFAULT 'apple',
  "product_id" text NOT NULL,
  "original_transaction_id" text NOT NULL,
  "expires_at" timestamptz,
  "environment" text NOT NULL DEFAULT 'production',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_original_tx_idx"
  ON "user_subscriptions" ("original_transaction_id");
