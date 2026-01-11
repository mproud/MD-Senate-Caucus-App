-- AddForeignKey
ALTER TABLE "BillNote" ADD CONSTRAINT "BillNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("clerkId") ON DELETE SET NULL ON UPDATE CASCADE;
