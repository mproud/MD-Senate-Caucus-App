-- CreateEnum
CREATE TYPE "Chamber" AS ENUM ('SENATE', 'HOUSE', 'JOINT');

-- CreateEnum
CREATE TYPE "ActionSource" AS ENUM ('MGA_JSON', 'MGA_SCRAPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "CalendarType" AS ENUM ('SECOND_READING', 'THIRD_READING', 'CONSENT', 'LAID_OVER', 'COMMITTEE', 'SPECIAL_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BILL_STATUS', 'CALENDAR', 'COMMITTEE_ACTION', 'HEARING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AlertDeliveryChannel" AS ENUM ('EMAIL', 'SMS', 'WEBHOOK', 'PUSH');

-- CreateEnum
CREATE TYPE "BillEventType" AS ENUM ('BILL_STATUS_CHANGED', 'BILL_NEW_ACTION', 'BILL_ADDED_TO_CALENDAR', 'BILL_REMOVED_FROM_CALENDAR', 'COMMITTEE_REFERRAL', 'COMMITTEE_VOTE_RECORDED', 'HEARING_SCHEDULED', 'HEARING_CHANGED', 'HEARING_CANCELED', 'CALENDAR_PUBLISHED', 'CALENDAR_UPDATED');

-- CreateTable
CREATE TABLE "legislators" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "suffix" TEXT,
    "nickname" TEXT,
    "fullName" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legislators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legislators_terms" (
    "id" SERIAL NOT NULL,
    "legislatorId" INTEGER NOT NULL,
    "chamber" "Chamber" NOT NULL,
    "district" TEXT,
    "room" TEXT,
    "building" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legislators_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committees" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "chamber" "Chamber",
    "abbreviation" TEXT,
    "name" TEXT NOT NULL,
    "committeeType" TEXT,
    "parentCommitteeId" INTEGER,
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committee_members" (
    "id" SERIAL NOT NULL,
    "committeeId" INTEGER NOT NULL,
    "legislatorId" INTEGER NOT NULL,
    "role" TEXT,
    "rank" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committee_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER,
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegationMember" (
    "id" SERIAL NOT NULL,
    "delegationId" INTEGER NOT NULL,
    "legislatorId" INTEGER NOT NULL,
    "role" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DelegationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "sessionYear" INTEGER NOT NULL,
    "sessionCode" TEXT NOT NULL,
    "chamber" "Chamber" NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billNumberNumeric" INTEGER,
    "billType" TEXT,
    "shortTitle" TEXT NOT NULL,
    "longTitle" TEXT,
    "synopsis" TEXT,
    "statusCode" TEXT,
    "statusDesc" TEXT,
    "lastActionDate" TIMESTAMP(3),
    "lastAction" TEXT,
    "crossFileExternalId" TEXT,
    "crossFileBillId" INTEGER,
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "primarySponsorId" INTEGER,
    "sponsorDisplay" TEXT,
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillVersion" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "versionCode" TEXT NOT NULL,
    "versionOrder" INTEGER NOT NULL,
    "label" TEXT,
    "introducedDate" TIMESTAMP(3),
    "urlPdf" TEXT,
    "urlHtml" TEXT,
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillAction" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "actionDate" TIMESTAMP(3) NOT NULL,
    "actionTime" TIMESTAMP(3),
    "chamber" "Chamber",
    "actionCode" TEXT,
    "description" TEXT NOT NULL,
    "committeeId" INTEGER,
    "calendarType" "CalendarType",
    "calendarNumber" INTEGER,
    "sequence" INTEGER,
    "isVote" BOOLEAN NOT NULL DEFAULT false,
    "motion" TEXT,
    "voteResult" TEXT,
    "yesVotes" INTEGER,
    "noVotes" INTEGER,
    "excused" INTEGER,
    "notVoting" INTEGER,
    "source" "ActionSource" NOT NULL DEFAULT 'MGA_JSON',
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillNote" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "userId" TEXT,
    "visibility" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillCurrentCommittee" (
    "billId" INTEGER NOT NULL,
    "committeeId" INTEGER NOT NULL,
    "referredDate" TIMESTAMP(3),
    "dataSource" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastVoteActionId" INTEGER,

    CONSTRAINT "BillCurrentCommittee_pkey" PRIMARY KEY ("billId")
);

-- CreateTable
CREATE TABLE "BillCommitteeHistory" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "committeeId" INTEGER NOT NULL,
    "referredDate" TIMESTAMP(3),
    "reportedOutDate" TIMESTAMP(3),
    "reportAction" TEXT,
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillCommitteeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillDelegation" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "delegationId" INTEGER NOT NULL,
    "relationshipType" TEXT,
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorCalendar" (
    "id" SERIAL NOT NULL,
    "sessionYear" INTEGER NOT NULL,
    "sessionCode" TEXT NOT NULL,
    "chamber" "Chamber" NOT NULL,
    "proceedingsNumber" INTEGER NOT NULL,
    "calendarType" "CalendarType" NOT NULL,
    "calendarNumber" INTEGER,
    "label" TEXT NOT NULL,
    "calendarDate" TIMESTAMP(3) NOT NULL,
    "legislativeDay" INTEGER,
    "sourceUrl" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarItem" (
    "id" SERIAL NOT NULL,
    "floorCalendarId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billId" INTEGER,
    "committeeId" INTEGER,
    "actionText" TEXT,
    "notes" TEXT,
    "dataSource" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillEvent" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "eventType" "BillEventType" NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chamber" "Chamber",
    "committeeId" INTEGER,
    "floorCalendarId" INTEGER,
    "calendarType" "CalendarType",
    "calendarNumber" INTEGER,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "processedForAlerts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "alertType" "AlertType" NOT NULL,
    "billId" INTEGER,
    "legislatorId" INTEGER,
    "committeeId" INTEGER,
    "delegationId" INTEGER,
    "chamber" "Chamber",
    "calendarType" "CalendarType",
    "eventTypeFilter" "BillEventType",
    "deliveryChannel" "AlertDeliveryChannel" NOT NULL DEFAULT 'EMAIL',
    "target" TEXT NOT NULL,
    "statusThreshold" TEXT,
    "includeHistory" BOOLEAN NOT NULL DEFAULT false,
    "lastTriggeredAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSchedule" (
    "id" SERIAL NOT NULL,
    "sessionYear" INTEGER NOT NULL,
    "chamber" "Chamber" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isSessionDay" BOOLEAN NOT NULL DEFAULT false,
    "peakStart" TIMESTAMP(3),
    "peakEnd" TIMESTAMP(3),
    "offpeakStart" TIMESTAMP(3),
    "offpeakEnd" TIMESTAMP(3),
    "mode" TEXT NOT NULL DEFAULT 'AUTO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legislators_terms_chamber_district_idx" ON "legislators_terms"("chamber", "district");

-- CreateIndex
CREATE UNIQUE INDEX "committees_externalId_key" ON "committees"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "committees_chamber_abbreviation_unique" ON "committees"("chamber", "abbreviation");

-- CreateIndex
CREATE INDEX "committee_members_committeeId_idx" ON "committee_members"("committeeId");

-- CreateIndex
CREATE UNIQUE INDEX "committee_members_committeeId_legislatorId_startDate_key" ON "committee_members"("committeeId", "legislatorId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Delegation_externalId_key" ON "Delegation"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "delegations_code_unique" ON "Delegation"("code");

-- CreateIndex
CREATE INDEX "DelegationMember_delegationId_idx" ON "DelegationMember"("delegationId");

-- CreateIndex
CREATE UNIQUE INDEX "DelegationMember_delegationId_legislatorId_startDate_key" ON "DelegationMember"("delegationId", "legislatorId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "bills_externalId_key" ON "bills"("externalId");

-- CreateIndex
CREATE INDEX "BillVersion_billId_versionOrder_idx" ON "BillVersion"("billId", "versionOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BillVersion_billId_versionCode_key" ON "BillVersion"("billId", "versionCode");

-- CreateIndex
CREATE INDEX "BillAction_billId_actionDate_sequence_idx" ON "BillAction"("billId", "actionDate", "sequence");

-- CreateIndex
CREATE INDEX "BillCommitteeHistory_billId_idx" ON "BillCommitteeHistory"("billId");

-- CreateIndex
CREATE INDEX "BillDelegation_billId_idx" ON "BillDelegation"("billId");

-- CreateIndex
CREATE INDEX "BillDelegation_delegationId_idx" ON "BillDelegation"("delegationId");

-- CreateIndex
CREATE UNIQUE INDEX "BillDelegation_billId_delegationId_key" ON "BillDelegation"("billId", "delegationId");

-- CreateIndex
CREATE INDEX "FloorCalendar_sessionYear_chamber_calendarDate_calendarType_idx" ON "FloorCalendar"("sessionYear", "chamber", "calendarDate", "calendarType");

-- CreateIndex
CREATE UNIQUE INDEX "FloorCalendar_sessionYear_chamber_proceedingsNumber_calenda_key" ON "FloorCalendar"("sessionYear", "chamber", "proceedingsNumber", "calendarType", "calendarNumber");

-- CreateIndex
CREATE INDEX "CalendarItem_floorCalendarId_position_idx" ON "CalendarItem"("floorCalendarId", "position");

-- CreateIndex
CREATE INDEX "CalendarItem_billId_idx" ON "CalendarItem"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarItem_floorCalendarId_position_key" ON "CalendarItem"("floorCalendarId", "position");

-- CreateIndex
CREATE INDEX "BillEvent_billId_eventTime_idx" ON "BillEvent"("billId", "eventTime");

-- CreateIndex
CREATE INDEX "BillEvent_eventType_eventTime_idx" ON "BillEvent"("eventType", "eventTime");

-- CreateIndex
CREATE INDEX "BillEvent_processedForAlerts_eventTime_idx" ON "BillEvent"("processedForAlerts", "eventTime");

-- CreateIndex
CREATE INDEX "Alert_userId_active_idx" ON "Alert"("userId", "active");

-- CreateIndex
CREATE INDEX "Alert_billId_active_idx" ON "Alert"("billId", "active");

-- CreateIndex
CREATE INDEX "Alert_committeeId_active_idx" ON "Alert"("committeeId", "active");

-- CreateIndex
CREATE INDEX "Alert_delegationId_active_idx" ON "Alert"("delegationId", "active");

-- CreateIndex
CREATE INDEX "Alert_chamber_calendarType_active_idx" ON "Alert"("chamber", "calendarType", "active");

-- CreateIndex
CREATE INDEX "SessionSchedule_sessionYear_chamber_date_idx" ON "SessionSchedule"("sessionYear", "chamber", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSchedule_sessionYear_chamber_date_key" ON "SessionSchedule"("sessionYear", "chamber", "date");

-- AddForeignKey
ALTER TABLE "legislators_terms" ADD CONSTRAINT "legislators_terms_legislatorId_fkey" FOREIGN KEY ("legislatorId") REFERENCES "legislators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committees" ADD CONSTRAINT "committees_parentCommitteeId_fkey" FOREIGN KEY ("parentCommitteeId") REFERENCES "committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_legislatorId_fkey" FOREIGN KEY ("legislatorId") REFERENCES "legislators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegationMember" ADD CONSTRAINT "DelegationMember_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegationMember" ADD CONSTRAINT "DelegationMember_legislatorId_fkey" FOREIGN KEY ("legislatorId") REFERENCES "legislators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_crossFileBillId_fkey" FOREIGN KEY ("crossFileBillId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_primarySponsorId_fkey" FOREIGN KEY ("primarySponsorId") REFERENCES "legislators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillVersion" ADD CONSTRAINT "BillVersion_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillAction" ADD CONSTRAINT "BillAction_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillAction" ADD CONSTRAINT "BillAction_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillNote" ADD CONSTRAINT "BillNote_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCurrentCommittee" ADD CONSTRAINT "BillCurrentCommittee_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCurrentCommittee" ADD CONSTRAINT "BillCurrentCommittee_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCurrentCommittee" ADD CONSTRAINT "BillCurrentCommittee_lastVoteActionId_fkey" FOREIGN KEY ("lastVoteActionId") REFERENCES "BillAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCommitteeHistory" ADD CONSTRAINT "BillCommitteeHistory_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCommitteeHistory" ADD CONSTRAINT "BillCommitteeHistory_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillDelegation" ADD CONSTRAINT "BillDelegation_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillDelegation" ADD CONSTRAINT "BillDelegation_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarItem" ADD CONSTRAINT "CalendarItem_floorCalendarId_fkey" FOREIGN KEY ("floorCalendarId") REFERENCES "FloorCalendar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarItem" ADD CONSTRAINT "CalendarItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarItem" ADD CONSTRAINT "CalendarItem_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillEvent" ADD CONSTRAINT "BillEvent_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillEvent" ADD CONSTRAINT "BillEvent_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillEvent" ADD CONSTRAINT "BillEvent_floorCalendarId_fkey" FOREIGN KEY ("floorCalendarId") REFERENCES "FloorCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_legislatorId_fkey" FOREIGN KEY ("legislatorId") REFERENCES "legislators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
