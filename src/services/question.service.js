const prisma = require("../config/prisma");
const storage = require("./storage.service");

/**
 * MCQ: needs correctAnswer, must NOT have a markscheme file.
 * WRITTEN: needs a markscheme file, must NOT have a correctAnswer.
 */
function validateTypeFields({ type, correctAnswer, markschemeFile }) {
  if (type === "MCQ") {
    if (!correctAnswer || !["A", "B", "C", "D"].includes(correctAnswer)) {
      throw { status: 400, msg: "MCQ questions require correctAnswer to be one of A/B/C/D" };
    }
    if (markschemeFile) {
      throw { status: 400, msg: "MCQ questions should not have a markscheme file" };
    }
  } else if (type === "WRITTEN") {
    if (!markschemeFile) {
      throw { status: 400, msg: "Written questions require a markscheme PDF" };
    }
    if (correctAnswer) {
      throw { status: 400, msg: "Written questions should not have a correctAnswer" };
    }
  } else {
    throw { status: 400, msg: "type must be MCQ or WRITTEN" };
  }
}

async function createQuestion({ type, correctAnswer, teacherId, questionFile, markschemeFile, topicIds }) {
  validateTypeFields({ type, correctAnswer, markschemeFile });
  if (!questionFile) throw { status: 400, msg: "questionFile (PDF) is required" };
  if (!topicIds || topicIds.length === 0) {
    throw { status: 400, msg: "At least one topicId is required" };
  }

  const questionFileUrl = await storage.uploadBuffer(
    questionFile.buffer,
    questionFile.originalname,
    questionFile.mimetype,
    "questions"
  );

  let markschemeFileUrl = null;
  if (markschemeFile) {
    markschemeFileUrl = await storage.uploadBuffer(
      markschemeFile.buffer,
      markschemeFile.originalname,
      markschemeFile.mimetype,
      "markschemes"
    );
  }

  return prisma.question.create({
    data: {
      type,
      questionFileUrl,
      correctAnswer: type === "MCQ" ? correctAnswer : null,
      markschemeFileUrl,
      teacherId,
      topics: { create: topicIds.map((topicId) => ({ topicId })) },
    },
    include: { topics: { include: { topic: { select: { id: true, name: true } } } } },
  });
}

async function listQuestionsForTeacher(teacherId, { topicId, type } = {}) {
  return prisma.question.findMany({
    where: {
      teacherId,
      ...(type ? { type } : {}),
      ...(topicId ? { topics: { some: { topicId } } } : {}),
    },
    include: { topics: { include: { topic: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

async function deleteQuestion(questionId) {
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw { status: 404, msg: "Question not found" };

  await storage.deleteFile(question.questionFileUrl);
  if (question.markschemeFileUrl) await storage.deleteFile(question.markschemeFileUrl);

  await prisma.questionTopic.deleteMany({ where: { questionId } });
  return prisma.question.delete({ where: { id: questionId } });
}

module.exports = { createQuestion, listQuestionsForTeacher, deleteQuestion };
