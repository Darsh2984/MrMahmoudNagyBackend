CREATE TABLE "PendingStudentRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PendingStudentRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingStudentRegistration_email_key" ON "PendingStudentRegistration"("email");
CREATE UNIQUE INDEX "PendingStudentRegistration_tokenHash_key" ON "PendingStudentRegistration"("tokenHash");
CREATE INDEX "PendingStudentRegistration_expiresAt_idx" ON "PendingStudentRegistration"("expiresAt");
