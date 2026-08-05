const prisma = require("../config/prisma");

async function getTeacherDashboardSummary(
  teacherId,
) {
  const years =
    await prisma.year.findMany({
      where: {
        teacherId,
      },

      include: {
        groups: {
          include: {
            members: true,
          },
        },
      },
    });

  const totalYears = years.length;

  const allGroups = years.flatMap(
    (year) => year.groups,
  );

  const totalGroups =
    allGroups.length;

  const uniqueStudentIds =
    new Set(
      allGroups.flatMap((group) =>
        group.members.map(
          (membership) =>
            membership.studentId,
        ),
      ),
    );

  const totalStudents =
    uniqueStudentIds.size;

  const unresolvedTickets =
    await prisma.ticket.count({
      where: {
        status: {
          in: [
            "OPEN",
            "REOPENED",
          ],
        },
      },
    });

  /*
   * Pending written grading
   *
   * Count complete PAPER quiz submissions
   * that have not yet been manually graded.
   *
   * This deliberately excludes:
   * - MCQ quizzes
   * - PAPER attempts not yet submitted
   * - PAPER submissions already graded
   */
  const ungradedWritten =
    await prisma.quizSubmission.count({
      where: {
        quiz: {
          teacherId,
          type: "PAPER",
        },

        isSubmitted: true,
        isGraded: false,
      },
    });

  const undelegatedSubmissions =
    await prisma.submission.count({
      where: {
        task: {
          teacherId,
        },

        delegation: {
          is: null,
        },

        grade: null,
      },
    });

  return {
    totalYears,
    totalGroups,
    totalStudents,
    unresolvedTickets,

    /*
     * Keep this response property for
     * frontend compatibility.
     *
     * It now represents the number of
     * submitted PAPER exams awaiting
     * manual grading.
     */
    ungradedWritten,

    undelegatedSubmissions,

    years: years.map((year) => ({
      id: year.id,
      name: year.name,

      groupCount:
        year.groups.length,

      studentCount:
        year.groups.reduce(
          (total, group) =>
            total +
            group.members.length,
          0,
        ),
    })),
  };
}

module.exports = {
  getTeacherDashboardSummary,
};