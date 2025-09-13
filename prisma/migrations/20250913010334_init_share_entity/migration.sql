-- CreateEnum
CREATE TYPE "public"."ShareVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC', 'AUTHENTICATED');

-- CreateTable
CREATE TABLE "public"."Share" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "visibility" "public"."ShareVisibility" NOT NULL DEFAULT 'PRIVATE',
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Share_draftId_key" ON "public"."Share"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "Share_publicId_key" ON "public"."Share"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Share_slug_key" ON "public"."Share"("slug");

-- CreateIndex
CREATE INDEX "Share_slug_idx" ON "public"."Share"("slug");

-- CreateIndex
CREATE INDEX "Share_visibility_idx" ON "public"."Share"("visibility");

-- CreateIndex
CREATE INDEX "Share_expiresAt_idx" ON "public"."Share"("expiresAt");

-- AddForeignKey
ALTER TABLE "public"."Share" ADD CONSTRAINT "Share_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "public"."Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
