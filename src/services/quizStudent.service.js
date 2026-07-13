const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");
const { sendExternalMessage } = require("./messaging.service");

async function listQuizzesForStudent(studentId) {
  const memberships = await prisma.groupMembership.findMany({ where: { studentId }, select: { groupId: true } });
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return [];

  const quizzes = await prisma.quiz.findMany({
    where: { groups: { some: { groupId: { in: groupIds } } } },
    include: { groups: { include: { group: { select: { id: true, name: true } } } }, questions: true },
    orderBy: { createdAt: "desc" },
  });

  const results = [];
  for (const quiz of quizzes) {
    const submission = await prisma.quizSubmission.findFirst({ where: { quizId: quiz.id, studentId } });
    results.push({
      ...quiz,
      hasStarted: !!submission,
      alreadySubmitted: submission?.isSubmitted || false,
      score: submission?.score ?? null,
      total: quiz.questions.length,
    });
  }
  return results;
}

/** Starts an attempt — idempotent, matches old behavior of "already started" being a non-error. */
async function startQuiz(quizId, studentId) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw { status: 404, msg: "Quiz not found" };

  const existing = await prisma.quizSubmission.findFirst({ where: { quizId, studentId } });
  if (existing) return { msg: "Quiz already started", startedAt: existing.startedAt };

  const submission = await prisma.quizSubmission.create({
    data: { quizId, studentId, score: 0, answers: [], isSubmitted: false },
  });
  return { msg: "Quiz started", startedAt: submission.startedAt };
}

/**
 * Answers ONE question at a time — this is what lets MCQ and WRITTEN coexist cleanly
 * in the same quiz. MCQ: pass answerText, auto-graded immediately. WRITTEN: pass a
 * photographed answer file, graded manually afterward (isCorrect stays null until a
 * teacher/assistant reviews it against the markscheme).
 */
async function answerQuestion({ quizId, studentId, questionId, answerText, file }) {
  const submission = await prisma.quizSubmission.findFirst({ where: { quizId, studentId } });
  if (!submission) throw { status: 400, msg: "Start the quiz before answering questions" };
  if (submission.isSubmitted) throw { status: 400, msg: "Quiz already submitted, cannot change answers" };

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw { status: 404, msg: "Question not found" };

  let entry;
  if (question.type === "MCQ") {
    entry = { questionId, answerText, isCorrect: answerText === question.correctAnswer };
  } else {
    if (!file) throw { status: 400, msg: "A photographed answer file is required for written questions" };
    const answerFileUrl = await storage.uploadBuffer(file.buffer, file.originalname, file.mimetype, "quiz-answers");
    entry = { questionId, answerFileUrl, isCorrect: null }; // pending manual grading
  }

  const answers = Array.isArray(submission.answers) ? submission.answers : [];
  const withoutThisQuestion = answers.filter((a) => a.questionId !== questionId);
  const updatedAnswers = [...withoutThisQuestion, entry];

  return prisma.quizSubmission.update({
    where: { id: submission.id },
    data: { answers: updatedAnswers },
  });
}

/** Finalizes the attempt. Score = count of answers currently marked isCorrect === true. */
async function submitQuiz(quizId, studentId) {
  const submission = await prisma.quizSubmission.findFirst({ where: { quizId, studentId } });
  if (!submission) throw { status: 404, msg: "Quiz was not started" };
  if (submission.isSubmitted) throw { status: 400, msg: "Quiz already submitted" };

  const answers = Array.isArray(submission.answers) ? submission.answers : [];
  const score = answers.filter((a) => a.isCorrect === true).length;

  const updated = await prisma.quizSubmission.update({
    where: { id: submission.id },
    data: { isSubmitted: true, submittedAt: new Date(), score },
  });

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { questions: true } });
  const student = await prisma.user.findUnique({ where: { id: studentId } });
  const total = quiz.questions?.length || answers.length;

  notify({
    userId: studentId,
    type: "GRADE_POSTED",
    title: "Quiz submitted",
    body: `"${quiz.title}" — score so far: ${score}/${total} (written answers pending review count as ungraded until reviewed)`,
    link: `/quizzes/${quizId}`,
  }).catch((err) => console.error("notify() failed:", err.message));

  if (student.phone) {
    sendExternalMessage(student.phone, `✅ Quiz Finished!\n\nTitle: ${quiz.title}\nScore: ${score}/${total}`).catch(() => {});
  }

  return updated;
}

async function getSubmissionDetail(quizId, studentId) {
  const submission = await prisma.quizSubmission.findFirst({ where: { quizId, studentId } });
  if (!submission) throw { status: 404, msg: "Submission not found" };
  return submission;
}

async function listSubmissionsForQuiz(quizId) {
  const submissions = await prisma.quizSubmission.findMany({
    where: { quizId },
    include: { student: { select: { id: true, name: true, email: true } } },
  });
  return submissions.map((s) => ({
    student: s.student,
    score: s.score,
    total: Array.isArray(s.answers) ? s.answers.length : 0,
    isSubmitted: s.isSubmitted,
  }));
}

/** Teacher/assistant manually grades a WRITTEN answer against the markscheme, then recomputes score. */
async function gradeWrittenAnswer({ submissionId, questionId, isCorrect }) {
  const submission = await prisma.quizSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw { status: 404, msg: "Submission not found" };

  const answers = Array.isArray(submission.answers) ? submission.answers : [];
  const updatedAnswers = answers.map((a) => (a.questionId === questionId ? { ...a, isCorrect } : a));
  const score = updatedAnswers.filter((a) => a.isCorrect === true).length;

  return prisma.quizSubmission.update({
    where: { id: submissionId },
    data: { answers: updatedAnswers, score },
  });
}

module.exports = {
  listQuizzesForStudent,
  startQuiz,
  answerQuestion,
  submitQuiz,
  getSubmissionDetail,
  listSubmissionsForQuiz,
  gradeWrittenAnswer,
};
