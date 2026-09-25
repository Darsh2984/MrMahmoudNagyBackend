CREATE TYPE "TaskType" AS ENUM ('HOMEWORK', 'IN_CLASS_QUIZ');

ALTER TABLE "Task"
ADD COLUMN "taskType" "TaskType" NOT NULL DEFAULT 'HOMEWORK';

CREATE INDEX "Task_taskType_idx" ON "Task"("taskType");
