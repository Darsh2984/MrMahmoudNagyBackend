-- CreateTable
CREATE TABLE "CorrectedPaperQuizFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectedPaperQuizFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorrectedPaperQuizFile_submissionId_order_idx" ON "CorrectedPaperQuizFile"("submissionId", "order");

-- CreateIndex
CREATE INDEX "CorrectedPaperQuizFile_uploadedById_idx" ON "CorrectedPaperQuizFile"("uploadedById");

-- AddForeignKey
ALTER TABLE "CorrectedPaperQuizFile" ADD CONSTRAINT "CorrectedPaperQuizFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "QuizSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectedPaperQuizFile" ADD CONSTRAINT "CorrectedPaperQuizFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
