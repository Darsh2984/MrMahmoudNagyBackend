-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "allowLateSubmission" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taskFileUrl" TEXT;
