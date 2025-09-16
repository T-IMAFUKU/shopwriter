/*
  Warnings:

  - You are about to drop the `Share` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Share" DROP CONSTRAINT "Share_draftId_fkey";

-- DropTable
DROP TABLE "public"."Share";

-- DropEnum
DROP TYPE "public"."ShareVisibility";

-- CreateTable
CREATE TABLE "public"."shares" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shares_userId_createdAt_idx" ON "public"."shares"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "shares_expiresAt_idx" ON "public"."shares"("expiresAt");

-- CreateIndex
CREATE INDEX "Draft_userId_createdAt_idx" ON "public"."Draft"("userId", "createdAt");
