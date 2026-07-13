const prisma = require("../config/prisma");

async function createQuiz({ title, teacherId, groupIds, duration, questionIds, startTime, endTime }) {
  if (!groupIds || groupIds.length === 0) throw { status: 400, msg: "At least one groupId is required" };
  if (!questionIds || questionIds.length === 0) throw { status: 400, msg: "At least one questionId is required" };

  return prisma.quiz.create({
    data: {
      title,
      teacherId,
      duration,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      groups: { create: groupIds.map((groupId) => ({ groupId })) },
      questions: { create: questionIds.map((questionId) => ({ questionId })) },
    },
    include: { groups: true, questions: true },
  });
}

async function listQuizzesForTeacher(teacherId) {
  return prisma.quiz.findMany({
    where: { teacherId },
    include: { groups: { include: { group: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Full quiz detail for the teacher — questions include correctAnswer/markscheme. */
async function getQuizForTeacher(quizId, teacherId) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      groups: { include: { group: { select: { id: true, name: true } } } },
      questions: { include: { question: true } },
    },
  });
  if (!quiz) throw { status: 404, msg: "Quiz not found" };
  if (quiz.teacherId !== teacherId) throw { status: 403, msg: "Not authorized to view this quiz" };
  return quiz;
}

async function deleteQuiz(quizId, teacherId) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw { status: 404, msg: "Quiz not found" };
  if (quiz.teacherId !== teacherId) throw { status: 403, msg: "Not authorized to delete this quiz" };
  return prisma.quiz.delete({ where: { id: quizId } });
}

module.exports = { createQuiz, listQuizzesForTeacher, getQuizForTeacher, deleteQuiz };
