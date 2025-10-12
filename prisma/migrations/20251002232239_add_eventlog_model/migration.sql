-- CreateEnum
CREATE TYPE "public"."EventLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "public"."EventLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "sessionId" TEXT,
    "category" TEXT,
    "event" TEXT NOT NULL,
    "level" "public"."EventLevel" NOT NULL DEFAULT 'INFO',
    "url" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "durationMs" INTEGER,
    "payload" JSONB,
    "context" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_eventlog_created_at" ON "public"."EventLog"("createdAt");

-- CreateIndex
CREATE INDEX "idx_eventlog_category_event" ON "public"."EventLog"("category", "event");

-- CreateIndex
CREATE INDEX "idx_eventlog_user_created" ON "public"."EventLog"("userId", "createdAt");
