CREATE TABLE "TaskAIGradingPack" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "questionPaperKey" TEXT NOT NULL,
  "questionPaperName" TEXT NOT NULL,
  "markSchemeKey" TEXT NOT NULL,
  "markSchemeName" TEXT NOT NULL,
  "rubric" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "error" TEXT,
  "model" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "uploadedByName" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedByName" TEXT,
  "cacheName" TEXT,
  "cacheModel" TEXT,
  "cacheExpiresAt" TIMESTAMP(3),
  "cacheRetryAfter" TIMESTAMP(3),
  "usage" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskAIGradingPack_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SubmissionAICorrection" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "submissionVersion" TEXT NOT NULL,
  "inputFiles" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "result" JSONB,
  "error" TEXT,
  "model" TEXT NOT NULL,
  "generatedById" TEXT NOT NULL,
  "generatedByName" TEXT NOT NULL,
  "usage" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "SubmissionAICorrection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskAIGradingPack_taskId_sourceHash_key" ON "TaskAIGradingPack"("taskId", "sourceHash");
CREATE INDEX "TaskAIGradingPack_taskId_activatedAt_idx" ON "TaskAIGradingPack"("taskId", "activatedAt");
CREATE UNIQUE INDEX "SubmissionAICorrection_submissionId_inputFingerprint_key" ON "SubmissionAICorrection"("submissionId", "inputFingerprint");
CREATE INDEX "SubmissionAICorrection_submissionId_createdAt_idx" ON "SubmissionAICorrection"("submissionId", "createdAt");
ALTER TABLE "TaskAIGradingPack" ADD CONSTRAINT "TaskAIGradingPack_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionAICorrection" ADD CONSTRAINT "SubmissionAICorrection_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionAICorrection" ADD CONSTRAINT "SubmissionAICorrection_packId_fkey" FOREIGN KEY ("packId") REFERENCES "TaskAIGradingPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
