/*
  Warnings:

  - A unique constraint covering the columns `[taskId,studentId]` on the table `Submission` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DelegationAction" AS ENUM ('ASSIGNED', 'REASSIGNED', 'REMOVED', 'COMPLETED');

-- DropForeignKey
ALTER TABLE "Delegation" DROP CONSTRAINT "Delegation_submissionId_fkey";

-- DropForeignKey
ALTER TABLE "Submission" DROP CONSTRAINT "Submission_taskId_fkey";

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "firstSubmittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "gradedById" TEXT,
ADD COLUMN     "lastModifiedAfterDeadline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "uploadedAfterDeadline" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectedSubmissionFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectedSubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionDelegationHistory" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "delegationId" TEXT,
    "action" "DelegationAction" NOT NULL,
    "fromAssistantId" TEXT,
    "toAssistantId" TEXT,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionDelegationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionFile_submissionId_order_idx" ON "SubmissionFile"("submissionId", "order");

-- CreateIndex
CREATE INDEX "SubmissionFile_uploadedById_idx" ON "SubmissionFile"("uploadedById");

-- CreateIndex
CREATE INDEX "SubmissionFile_uploadedAfterDeadline_idx" ON "SubmissionFile"("uploadedAfterDeadline");

-- CreateIndex
CREATE INDEX "CorrectedSubmissionFile_submissionId_order_idx" ON "CorrectedSubmissionFile"("submissionId", "order");

-- CreateIndex
CREATE INDEX "CorrectedSubmissionFile_uploadedById_idx" ON "CorrectedSubmissionFile"("uploadedById");

-- CreateIndex
CREATE INDEX "SubmissionDelegationHistory_submissionId_createdAt_idx" ON "SubmissionDelegationHistory"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionDelegationHistory_delegationId_idx" ON "SubmissionDelegationHistory"("delegationId");

-- CreateIndex
CREATE INDEX "SubmissionDelegationHistory_fromAssistantId_idx" ON "SubmissionDelegationHistory"("fromAssistantId");

-- CreateIndex
CREATE INDEX "SubmissionDelegationHistory_toAssistantId_idx" ON "SubmissionDelegationHistory"("toAssistantId");

-- CreateIndex
CREATE INDEX "SubmissionDelegationHistory_changedById_idx" ON "SubmissionDelegationHistory"("changedById");

-- CreateIndex
CREATE INDEX "SubmissionDelegationHistory_action_idx" ON "SubmissionDelegationHistory"("action");

-- CreateIndex
CREATE INDEX "Delegation_completedAt_idx" ON "Delegation"("completedAt");

-- CreateIndex
CREATE INDEX "Submission_taskId_idx" ON "Submission"("taskId");

-- CreateIndex
CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

-- CreateIndex
CREATE INDEX "Submission_gradedAt_idx" ON "Submission"("gradedAt");

-- CreateIndex
CREATE INDEX "Submission_gradedById_idx" ON "Submission"("gradedById");

-- CreateIndex
CREATE INDEX "Submission_lastModifiedAfterDeadline_idx" ON "Submission"("lastModifiedAfterDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_taskId_studentId_key" ON "Submission"("taskId", "studentId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectedSubmissionFile" ADD CONSTRAINT "CorrectedSubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectedSubmissionFile" ADD CONSTRAINT "CorrectedSubmissionFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegation" ADD CONSTRAINT "Delegation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionDelegationHistory" ADD CONSTRAINT "SubmissionDelegationHistory_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionDelegationHistory" ADD CONSTRAINT "SubmissionDelegationHistory_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "Delegation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionDelegationHistory" ADD CONSTRAINT "SubmissionDelegationHistory_fromAssistantId_fkey" FOREIGN KEY ("fromAssistantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionDelegationHistory" ADD CONSTRAINT "SubmissionDelegationHistory_toAssistantId_fkey" FOREIGN KEY ("toAssistantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionDelegationHistory" ADD CONSTRAINT "SubmissionDelegationHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
