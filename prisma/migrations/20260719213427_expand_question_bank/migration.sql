-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "points" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT 'Untitled question',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Question_teacherId_idx" ON "Question"("teacherId");

-- CreateIndex
CREATE INDEX "Question_type_idx" ON "Question"("type");

-- CreateIndex
CREATE INDEX "Question_title_idx" ON "Question"("title");
