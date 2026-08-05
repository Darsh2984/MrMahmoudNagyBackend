/*
  Warnings:

  - You are about to drop the column `yearId` on the `Unit` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Unit" DROP CONSTRAINT "Unit_yearId_fkey";

-- AlterTable
ALTER TABLE "Unit" DROP COLUMN "yearId",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Unit_name_idx" ON "Unit"("name");

-- CreateIndex
CREATE INDEX "Unit_teacherId_idx" ON "Unit"("teacherId");
