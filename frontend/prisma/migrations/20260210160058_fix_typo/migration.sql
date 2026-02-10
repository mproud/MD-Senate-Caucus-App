/*
  Warnings:

  - The values [HEARING_CANCELLED] on the enum `BillEventType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "BillEventType_new" AS ENUM ('BILL_INTRODUCED', 'BILL_STATUS_CHANGED', 'BILL_NEW_ACTION', 'BILL_ADDED_TO_CALENDAR', 'BILL_REMOVED_FROM_CALENDAR', 'COMMITTEE_REFERRAL', 'COMMITTEE_VOTE_RECORDED', 'HEARING_SCHEDULED', 'HEARING_CHANGED', 'HEARING_CANCELED', 'CALENDAR_PUBLISHED', 'CALENDAR_UPDATED', 'FLOOR_VOTE_RECORDED');
ALTER TABLE "BillEvent" ALTER COLUMN "eventType" TYPE "BillEventType_new" USING ("eventType"::text::"BillEventType_new");
ALTER TABLE "Alert" ALTER COLUMN "eventTypeFilter" TYPE "BillEventType_new" USING ("eventTypeFilter"::text::"BillEventType_new");
ALTER TYPE "BillEventType" RENAME TO "BillEventType_old";
ALTER TYPE "BillEventType_new" RENAME TO "BillEventType";
DROP TYPE "public"."BillEventType_old";
COMMIT;
