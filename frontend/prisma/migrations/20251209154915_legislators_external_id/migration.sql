/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `legislators` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "legislators" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "legislators_externalId_key" ON "legislators"("externalId");
