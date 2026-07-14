const prisma = require("../config/prisma");

async function getTeacherDashboardSummary(teacherId) {
  const years = await prisma.year.findMany({
    where: { teacherId },
    include: { groups: { include: { members: true } } },
  });

  const totalYears = years.length;
  const allGroups = years.flatMap((y) => y.groups);
  const totalGroups = allGroups.length;
  const uniqueStudentIds = new Set(allGroups.flatMap((g) => g.members.map((m) => m.studentId)));
  const totalStudents = uniqueStudentIds.size;

  const unresolvedTickets = await prisma.ticket.count({
    where: { status: { in: ["OPEN", "REOPENED"] } },
  });

  // Ungraded written quiz answers — counted in JS since answers live in a JSON column.
  const quizzes = await prisma.quiz.findMany({ where: { teacherId }, select: { id: true } });
  const quizIds = quizzes.map((q) => q.id);
  const submissions = await prisma.quizSubmission.findMany({
    where: { quizId: { in: quizIds }, isSubmitted: true },
    select: { answers: true },
  });
  let ungradedWritten = 0;
  for (const sub of submissions) {
    const answers = Array.isArray(sub.answers) ? sub.answers : [];
    ungradedWritten += answers.filter((a) => a.isCorrect === null || a.isCorrect === undefined).length;
  }

  const undelegatedSubmissions = await prisma.submission.count({
    where: { task: { teacherId }, delegation: { is: null }, grade: null },
  });

  return {
    totalYears,
    totalGroups,
    totalStudents,
    unresolvedTickets,
    ungradedWritten,
    undelegatedSubmissions,
    years: years.map((y) => ({
      id: y.id,
      name: y.name,
      groupCount: y.groups.length,
      studentCount: y.groups.reduce((sum, g) => sum + g.members.length, 0),
    })),
  };
}

module.exports = { getTeacherDashboardSummary };
