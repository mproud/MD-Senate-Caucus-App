/*
  Warnings:

  - The `status` column on the `AlertDelivery` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AlertSendMode" AS ENUM ('INSTANT', 'DIGEST');

-- CreateEnum
CREATE TYPE "AlertDigestCadence" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "AlertDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "digestCadence" "AlertDigestCadence",
ADD COLUMN     "digestMinutes" INTEGER,
ADD COLUMN     "sendMode" "AlertSendMode" NOT NULL DEFAULT 'INSTANT';

-- AlterTable
ALTER TABLE "AlertDelivery" DROP COLUMN "status",
ADD COLUMN     "status" "AlertDeliveryStatus" NOT NULL DEFAULT 'QUEUED';

-- CreateIndex
CREATE INDEX "Alert_sendMode_digestCadence_active_idx" ON "Alert"("sendMode", "digestCadence", "active");

-- CreateIndex
CREATE INDEX "AlertDelivery_status_createdAt_idx" ON "AlertDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AlertDelivery_billEventId_idx" ON "AlertDelivery"("billEventId");
