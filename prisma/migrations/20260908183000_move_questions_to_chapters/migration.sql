ALTER TABLE "Question" ADD COLUMN "chapterId" TEXT;

UPDATE "Question" AS q
SET "chapterId" = source."chapterId"
FROM (
  SELECT DISTINCT ON ("questionId")
    "questionId",
    t."chapterId"
  FROM "QuestionTopic" qt
  JOIN "Topic" t ON t.id = qt."topicId"
  ORDER BY "questionId", qt.id
) AS source
WHERE q.id = source."questionId";

CREATE INDEX "Question_chapterId_idx" ON "Question"("chapterId");

ALTER TABLE "Question"
ADD CONSTRAINT "Question_chapterId_fkey"
FOREIGN KEY ("chapterId") REFERENCES "Chapter"(id)
ON DELETE SET NULL ON UPDATE CASCADE;
