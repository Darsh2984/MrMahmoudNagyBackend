-- AlterTable
ALTER TABLE "User" ADD COLUMN     "desiredYearId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_desiredYearId_fkey" FOREIGN KEY ("desiredYearId") REFERENCES "Year"("id") ON DELETE SET NULL ON UPDATE CASCADE;
