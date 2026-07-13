const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");

/** Teacher poses a question worth X marks during a live session. */
async function createLiveQuestion({ sessionId, prompt, gradeOutOf }) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) throw { status: 404, msg: "Session not found" };

  return prisma.liveQuestion.create({ data: { sessionId, prompt, gradeOutOf } });
}

/** Student photographs their handwritten answer and uploads it. */
async function submitAnswer({ liveQuestionId, studentId, file }) {
  if (!file) throw { status: 400, msg: "No answer image provided" };

  const question = await prisma.liveQuestion.findUnique({ where: { id: liveQuestionId } });
  if (!question) throw { status: 404, msg: "Live question not found" };

  const existing = await prisma.liveQuestionAnswer.findUnique({
    where: { liveQuestionId_studentId: { liveQuestionId, studentId } },
  });
  if (existing) throw { status: 400, msg: "You've already submitted an answer for this question" };

  const answerImageUrl = await storage.uploadBuffer(file.buffer, file.originalname, file.mimetype, "live-answers");

  return prisma.liveQuestionAnswer.create({
    data: { liveQuestionId, studentId, answerImageUrl },
  });
}

/** Assistant grades the photographed answer immediately. */
async function gradeAnswer({ answerId, gradedById, grade }) {
  const answer = await prisma.liveQuestionAnswer.findUnique({
    where: { id: answerId },
    include: { liveQuestion: true },
  });
  if (!answer) throw { status: 404, msg: "Answer not found" };
  if (grade < 0 || grade > answer.liveQuestion.gradeOutOf) {
    throw { status: 400, msg: `Grade must be between 0 and ${answer.liveQuestion.gradeOutOf}` };
  }

  const graded = await prisma.liveQuestionAnswer.update({
    where: { id: answerId },
    data: { grade, status: "GRADED", gradedById, gradedAt: new Date() },
  });

  notify({
    userId: answer.studentId,
    type: "GRADE_POSTED",
    title: "Your answer was graded",
    body: `You scored ${grade}/${answer.liveQuestion.gradeOutOf} on "${answer.liveQuestion.prompt}"`,
    link: `/live-questions/${answer.liveQuestionId}`,
  }).catch((err) => console.error("notify() failed:", err.message));

  return graded;
}

async function listAnswersForQuestion(liveQuestionId) {
  return prisma.liveQuestionAnswer.findMany({
    where: { liveQuestionId },
    include: { student: { select: { id: true, name: true } }, gradedBy: { select: { id: true, name: true } } },
    orderBy: { submittedAt: "asc" },
  });
}

module.exports = { createLiveQuestion, submitAnswer, gradeAnswer, listAnswersForQuestion };
