/*
  Warnings:

  - A unique constraint covering the columns `[sessionYear,chamber,proceedingsNumber,calendarType,calendarNumber,committeeId]` on the table `FloorCalendar` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "FloorCalendar_sessionYear_chamber_proceedingsNumber_calenda_key";

-- CreateIndex
CREATE UNIQUE INDEX "FloorCalendar_sessionYear_chamber_proceedingsNumber_calenda_key" ON "FloorCalendar"("sessionYear", "chamber", "proceedingsNumber", "calendarType", "calendarNumber", "committeeId");
