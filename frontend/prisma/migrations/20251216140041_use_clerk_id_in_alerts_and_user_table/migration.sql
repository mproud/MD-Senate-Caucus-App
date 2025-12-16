/*
  Warnings:

  - You are about to drop the column `userId` on the `Alert` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Alert_userId_active_idx";

-- AlterTable
ALTER TABLE "Alert" DROP COLUMN "userId",
ADD COLUMN     "clerkUserId" TEXT;

-- CreateIndex
CREATE INDEX "Alert_clerkUserId_active_idx" ON "Alert"("clerkUserId", "active");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_clerkUserId_fkey" FOREIGN KEY ("clerkUserId") REFERENCES "User"("clerkId") ON DELETE SET NULL ON UPDATE CASCADE;
