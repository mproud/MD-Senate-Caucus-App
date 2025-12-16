-- CreateEnum
CREATE TYPE "BillEventAlertsStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "BillEvent" ADD COLUMN     "alertsAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "alertsLastError" TEXT,
ADD COLUMN     "alertsNextAttemptAt" TIMESTAMPTZ(6),
ADD COLUMN     "alertsProcessedAt" TIMESTAMPTZ(6),
ADD COLUMN     "alertsStatus" "BillEventAlertsStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" SERIAL NOT NULL,
    "alertId" INTEGER NOT NULL,
    "billEventId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertDelivery_status_createdAt_idx" ON "AlertDelivery"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertDelivery_alertId_billEventId_key" ON "AlertDelivery"("alertId", "billEventId");

-- CreateIndex
CREATE INDEX "BillEvent_alertsStatus_alertsNextAttemptAt_idx" ON "BillEvent"("alertsStatus", "alertsNextAttemptAt");

-- CreateIndex
CREATE INDEX "BillEvent_alertsStatus_eventTime_idx" ON "BillEvent"("alertsStatus", "eventTime");

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_billEventId_fkey" FOREIGN KEY ("billEventId") REFERENCES "BillEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
