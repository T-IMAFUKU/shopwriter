/*
  Warnings:

  - You are about to drop the `shares` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."MetricEvent" DROP CONSTRAINT "MetricEvent_shareId_fkey";

-- DropForeignKey
ALTER TABLE "public"."shares" DROP CONSTRAINT "Share_ownerId_fkey";

-- DropTable
DROP TABLE "public"."shares";

-- CreateTable
CREATE TABLE "public"."Share" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Template" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Share_ownerId_isPublic_idx" ON "public"."Share"("ownerId", "isPublic");

-- CreateIndex
CREATE INDEX "idx_template_user_id" ON "public"."Template"("userId");

-- AddForeignKey
ALTER TABLE "public"."Share" ADD CONSTRAINT "Share_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MetricEvent" ADD CONSTRAINT "MetricEvent_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "public"."Share"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Template" ADD CONSTRAINT "Template_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
