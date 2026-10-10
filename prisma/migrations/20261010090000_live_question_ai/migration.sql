CREATE TABLE "LiveQuestionAIPack" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "questionId" TEXT NOT NULL REFERENCES "LiveQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "questionKey" TEXT NOT NULL, "schemeKey" TEXT NOT NULL,
  "questionName" TEXT NOT NULL, "schemeName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING', "rubric" JSONB, "error" TEXT,
  "approved" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LiveQuestionAIPack_questionId_createdAt_idx" ON "LiveQuestionAIPack"("questionId", "createdAt");
CREATE TABLE "LiveAnswerAICorrection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "answerId" TEXT NOT NULL REFERENCES "LiveQuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "packId" TEXT NOT NULL REFERENCES "LiveQuestionAIPack"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING', "result" JSONB, "reviewedResult" JSONB,
  "confirmedAt" TIMESTAMP(3), "confirmedByName" TEXT, "error" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "LiveAnswerAICorrection_answerId_packId_key" ON "LiveAnswerAICorrection"("answerId", "packId");
