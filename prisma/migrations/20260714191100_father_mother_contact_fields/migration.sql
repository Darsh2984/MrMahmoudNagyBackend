/*
  Warnings:

  - You are about to drop the column `parentName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `parentPhone` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "parentName",
DROP COLUMN "parentPhone",
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "fatherPhone" TEXT,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "motherPhone" TEXT;
