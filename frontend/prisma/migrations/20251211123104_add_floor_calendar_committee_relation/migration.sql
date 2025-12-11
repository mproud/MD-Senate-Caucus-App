-- AlterTable
ALTER TABLE "FloorCalendar" ADD COLUMN     "committeeId" INTEGER;

-- AddForeignKey
ALTER TABLE "FloorCalendar" ADD CONSTRAINT "FloorCalendar_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
