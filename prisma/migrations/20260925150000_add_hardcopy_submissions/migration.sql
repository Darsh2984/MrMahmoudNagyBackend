CREATE TYPE "SubmissionMethod" AS ENUM ('ONLINE', 'HARDCOPY');

ALTER TABLE "Submission"
ADD COLUMN "submissionMethod" "SubmissionMethod" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN "hardcopyMarkedAt" TIMESTAMP(3),
ADD COLUMN "hardcopyMarkedById" TEXT;

ALTER TABLE "Submission"
ADD CONSTRAINT "Submission_hardcopyMarkedById_fkey"
FOREIGN KEY ("hardcopyMarkedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Submission_submissionMethod_idx"
ON "Submission"("submissionMethod");

CREATE INDEX "Submission_hardcopyMarkedById_idx"
ON "Submission"("hardcopyMarkedById");
