/*
  Warnings:

  - You are about to drop the column `note` on the `BillNote` table. All the data in the column will be lost.
  - Added the required column `content` to the `BillNote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `BillNote` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BillNote" DROP COLUMN "note",
ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
