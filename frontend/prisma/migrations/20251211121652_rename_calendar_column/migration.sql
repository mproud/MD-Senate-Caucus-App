/*
  Warnings:

  - You are about to drop the column `label` on the `FloorCalendar` table. All the data in the column will be lost.
  - Added the required column `calendarName` to the `FloorCalendar` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FloorCalendar" DROP COLUMN "label",
ADD COLUMN     "calendarName" TEXT NOT NULL;
