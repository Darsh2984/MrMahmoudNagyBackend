-- CreateTable
CREATE TABLE "StudentActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "successful" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "durationMs" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentActivityLog_createdAt_idx" ON "StudentActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "StudentActivityLog_userId_createdAt_idx" ON "StudentActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentActivityLog_successful_createdAt_idx" ON "StudentActivityLog"("successful", "createdAt");

-- CreateIndex
CREATE INDEX "StudentActivityLog_statusCode_createdAt_idx" ON "StudentActivityLog"("statusCode", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentActivityLog" ADD CONSTRAINT "StudentActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

