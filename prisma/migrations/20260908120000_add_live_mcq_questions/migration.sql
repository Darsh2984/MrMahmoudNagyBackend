ALTER TABLE "LiveQuestion"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'WRITTEN',
ADD COLUMN "questionImageUrl" TEXT,
ADD COLUMN "optionA" TEXT,
ADD COLUMN "optionB" TEXT,
ADD COLUMN "optionC" TEXT,
ADD COLUMN "optionD" TEXT,
ADD COLUMN "correctAnswer" TEXT;

ALTER TABLE "LiveQuestionAnswer"
ALTER COLUMN "answerImageUrl" DROP NOT NULL,
ADD COLUMN "selectedOption" TEXT;
