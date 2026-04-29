-- Add per-user sync term limit and global app settings.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sync_term_limit" INTEGER NOT NULL DEFAULT 500;

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
