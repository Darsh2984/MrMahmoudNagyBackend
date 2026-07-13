/*
  Warnings:

  - You are about to drop the column `chapterId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `imageUrl` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `topicId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `unitId` on the `Question` table. All the data in the column will be lost.
  - Added the required column `questionFileUrl` to the `Question` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Question` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'WRITTEN');

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_chapterId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_topicId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_unitId_fkey";

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "chapterId",
DROP COLUMN "imageUrl",
DROP COLUMN "topicId",
DROP COLUMN "unitId",
ADD COLUMN     "markschemeFileUrl" TEXT,
ADD COLUMN     "questionFileUrl" TEXT NOT NULL,
ADD COLUMN     "type" "QuestionType" NOT NULL,
ALTER COLUMN "correctAnswer" DROP NOT NULL;

-- CreateTable
CREATE TABLE "QuestionTopic" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "QuestionTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionTopic_questionId_topicId_key" ON "QuestionTopic"("questionId", "topicId");

-- AddForeignKey
ALTER TABLE "QuestionTopic" ADD CONSTRAINT "QuestionTopic_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTopic" ADD CONSTRAINT "QuestionTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
