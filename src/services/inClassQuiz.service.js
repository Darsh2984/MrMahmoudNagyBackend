const prisma = require("../config/prisma");
const { notify } = require("./notification.service");
const { sendExternalMessage } = require("./messaging.service");

async function createInClassQuiz({ teacherId, yearId, groupId, quizName, date, gradeOutOf }) {
  const members = await prisma.groupMembership.findMany({
    where: { groupId },
    include: { student: { select: { id: true } } },
  });

  const studentGrades = members.map((m) => ({
    studentId: m.student.id,
    grade: null,
    percentage: null,
    letterGrade: "",
  }));

  return prisma.inClassQuiz.create({
    data: { teacherId, yearId, groupId, quizName, date: new Date(date), gradeOutOf, studentGrades },
  });
}

async function listForGroup(groupId) {
  return prisma.inClassQuiz.findMany({ where: { groupId }, orderBy: { date: "desc" } });
}

/** Bulk grade update — mirrors the old system's behavior of notifying student + parent per grade. */
async function updateGrades(quizId, studentGrades) {
  const quiz = await prisma.inClassQuiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw { status: 404, msg: "Quiz not found" };

  const updated = await prisma.inClassQuiz.update({
    where: { id: quizId },
    data: {
      studentGrades: studentGrades.map((sg) => ({
        studentId: sg.studentId,
        grade: sg.grade ?? null,
        percentage: sg.percentage ?? null,
        letterGrade: sg.letterGrade ?? "",
      })),
    },
  });

  for (const sg of studentGrades) {
    if (sg.grade === null || sg.grade === undefined) continue;
    const student = await prisma.user.findUnique({ where: { id: sg.studentId } });
    if (!student) continue;

    notify({
      userId: student.id,
      type: "GRADE_POSTED",
      title: "In-class quiz grade added",
      body: `${quiz.quizName}: ${sg.grade}/${quiz.gradeOutOf}`,
      link: `/in-class-quizzes/${quizId}`,
    }).catch((err) => console.error("notify() failed:", err.message));

    if (student.phone) {
      sendExternalMessage(
        student.phone,
        `📘 In-Class Quiz Grade Added!\n\nQuiz: ${quiz.quizName}\nScore: ${sg.grade}/${quiz.gradeOutOf}`
      ).catch(() => {});
    }
  }

  return updated;
}

async function updateQuizDetails(quizId, { quizName, date, gradeOutOf }) {
  return prisma.inClassQuiz.update({
    where: { id: quizId },
    data: {
      ...(quizName ? { quizName } : {}),
      ...(date ? { date: new Date(date) } : {}),
      ...(gradeOutOf !== undefined ? { gradeOutOf } : {}),
    },
  });
}

async function deleteInClassQuiz(quizId) {
  return prisma.inClassQuiz.delete({ where: { id: quizId } });
}

module.exports = { createInClassQuiz, listForGroup, updateGrades, updateQuizDetails, deleteInClassQuiz };
