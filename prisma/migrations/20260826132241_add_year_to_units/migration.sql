-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "yearId" TEXT;

-- CreateIndex
CREATE INDEX "Unit_yearId_idx" ON "Unit"("yearId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE SET NULL ON UPDATE CASCADE;
