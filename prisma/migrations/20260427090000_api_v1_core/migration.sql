-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "beta_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "users" ADD COLUMN "ai_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "sync_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "access_tokens" ADD COLUMN "revoked_at" TIMESTAMP(3);
ALTER TABLE "access_tokens" ADD COLUMN "last_used_at" TIMESTAMP(3);
ALTER TABLE "access_tokens" ALTER COLUMN "scope" SET DEFAULT ARRAY['ai:analyze', 'sync:snapshot']::TEXT[];

-- AlterTable
ALTER TABLE "ai_requests" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'annotate';
ALTER TABLE "ai_requests" ADD COLUMN "output_preview" TEXT;
ALTER TABLE "ai_requests" ADD COLUMN "latency_ms" INTEGER;
ALTER TABLE "ai_requests" ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beta_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beta_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "term_count" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "last_sync_status" TEXT NOT NULL DEFAULT 'success',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cloud_snapshots_user_id_key" ON "cloud_snapshots"("user_id");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beta_applications" ADD CONSTRAINT "beta_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_snapshots" ADD CONSTRAINT "cloud_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
