-- CreateEnum
CREATE TYPE "HomeworkGradingAction" AS ENUM ('GRADED', 'EDITED', 'REOPENED');

-- AlterEnum
ALTER TYPE "DelegationAction" ADD VALUE 'REOPENED';

-- CreateTable
CREATE TABLE "HomeworkGradingHistory" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "action" "HomeworkGradingAction" NOT NULL,
    "previousGrade" DOUBLE PRECISION,
    "newGrade" DOUBLE PRECISION,
    "previousComments" TEXT,
    "newComments" TEXT,
    "previousGradedAt" TIMESTAMP(3),
    "newGradedAt" TIMESTAMP(3),
    "previousGradedById" TEXT,
    "newGradedById" TEXT,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkGradingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeworkGradingHistory_submissionId_createdAt_idx" ON "HomeworkGradingHistory"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "HomeworkGradingHistory_changedById_idx" ON "HomeworkGradingHistory"("changedById");

-- CreateIndex
CREATE INDEX "HomeworkGradingHistory_action_idx" ON "HomeworkGradingHistory"("action");

-- AddForeignKey
ALTER TABLE "HomeworkGradingHistory" ADD CONSTRAINT "HomeworkGradingHistory_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkGradingHistory" ADD CONSTRAINT "HomeworkGradingHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
