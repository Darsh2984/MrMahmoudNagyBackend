-- AlterTable
ALTER TABLE "QuizSubmission" ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "gradedById" TEXT,
ADD COLUMN     "gradingComments" TEXT,
ADD COLUMN     "isGraded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paperFileKey" TEXT,
ADD COLUMN     "paperGeneratedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaperQuizSubmissionFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperQuizSubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperQuizSubmissionFile_submissionId_order_idx" ON "PaperQuizSubmissionFile"("submissionId", "order");

-- CreateIndex
CREATE INDEX "QuizSubmission_isGraded_idx" ON "QuizSubmission"("isGraded");

-- AddForeignKey
ALTER TABLE "QuizSubmission" ADD CONSTRAINT "QuizSubmission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperQuizSubmissionFile" ADD CONSTRAINT "PaperQuizSubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "QuizSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
