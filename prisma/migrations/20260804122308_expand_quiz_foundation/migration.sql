-- CreateEnum
CREATE TYPE "QuizType" AS ENUM ('MCQ', 'PAPER');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- DropForeignKey
ALTER TABLE "QuizGroup" DROP CONSTRAINT "QuizGroup_quizId_fkey";

-- DropForeignKey
ALTER TABLE "QuizQuestion" DROP CONSTRAINT "QuizQuestion_quizId_fkey";

-- DropForeignKey
ALTER TABLE "QuizSubmission" DROP CONSTRAINT "QuizSubmission_quizId_fkey";

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "description" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "type" "QuizType" NOT NULL DEFAULT 'MCQ',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "QuizGroup" ADD COLUMN     "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "points" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "QuizSubmission" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "isAutoSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Quiz_teacherId_idx" ON "Quiz"("teacherId");

-- CreateIndex
CREATE INDEX "Quiz_type_idx" ON "Quiz"("type");

-- CreateIndex
CREATE INDEX "Quiz_status_idx" ON "Quiz"("status");

-- CreateIndex
CREATE INDEX "Quiz_startTime_idx" ON "Quiz"("startTime");

-- CreateIndex
CREATE INDEX "Quiz_endTime_idx" ON "Quiz"("endTime");

-- CreateIndex
CREATE INDEX "QuizGroup_groupId_idx" ON "QuizGroup"("groupId");

-- CreateIndex
CREATE INDEX "QuizQuestion_quizId_order_idx" ON "QuizQuestion"("quizId", "order");

-- CreateIndex
CREATE INDEX "QuizQuestion_questionId_idx" ON "QuizQuestion"("questionId");

-- CreateIndex
CREATE INDEX "QuizSubmission_quizId_idx" ON "QuizSubmission"("quizId");

-- CreateIndex
CREATE INDEX "QuizSubmission_studentId_idx" ON "QuizSubmission"("studentId");

-- CreateIndex
CREATE INDEX "QuizSubmission_quizId_studentId_idx" ON "QuizSubmission"("quizId", "studentId");

-- CreateIndex
CREATE INDEX "QuizSubmission_isSubmitted_idx" ON "QuizSubmission"("isSubmitted");

-- AddForeignKey
ALTER TABLE "QuizGroup" ADD CONSTRAINT "QuizGroup_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizSubmission" ADD CONSTRAINT "QuizSubmission_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
