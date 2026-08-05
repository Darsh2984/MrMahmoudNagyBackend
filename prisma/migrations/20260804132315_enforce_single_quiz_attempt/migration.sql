/*
  Warnings:

  - A unique constraint covering the columns `[quizId,studentId]` on the table `QuizSubmission` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "QuizSubmission_quizId_studentId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "QuizSubmission_quizId_studentId_key" ON "QuizSubmission"("quizId", "studentId");
