-- CreateEnum
CREATE TYPE "Vote" AS ENUM ('YEA', 'NAY', 'ABSTAIN', 'EXCUSED', 'ABSENT');

-- CreateTable
CREATE TABLE "Votes" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "billActionId" INTEGER NOT NULL,
    "legislatorId" INTEGER NOT NULL,
    "vote" "Vote" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Votes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Votes" ADD CONSTRAINT "Votes_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Votes" ADD CONSTRAINT "Votes_billActionId_fkey" FOREIGN KEY ("billActionId") REFERENCES "BillAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Votes" ADD CONSTRAINT "Votes_legislatorId_fkey" FOREIGN KEY ("legislatorId") REFERENCES "legislators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
