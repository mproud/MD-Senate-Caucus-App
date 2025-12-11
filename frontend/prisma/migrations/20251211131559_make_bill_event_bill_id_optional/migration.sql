-- DropForeignKey
ALTER TABLE "BillEvent" DROP CONSTRAINT "BillEvent_billId_fkey";

-- AlterTable
ALTER TABLE "BillEvent" ALTER COLUMN "billId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "BillEvent" ADD CONSTRAINT "BillEvent_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
