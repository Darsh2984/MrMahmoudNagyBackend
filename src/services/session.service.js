const prisma = require("../config/prisma");

async function createSession({ title, date, teacherId, yearId, groupId }) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw { status: 404, msg: "Group not found" };

  return prisma.session.create({ data: { title, date: date ? new Date(date) : undefined, teacherId, yearId, groupId } });
}

async function listSessionsByGroup(groupId) {
  return prisma.session.findMany({ where: { groupId }, orderBy: { date: "desc" } });
}

async function getSessionWithDetails(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      attendance: { include: { student: { select: { id: true, name: true } } } },
      liveQuestions: { include: { answers: true } },
      group: { select: { id: true, name: true } },
    },
  });
  if (!session) throw { status: 404, msg: "Session not found" };
  return session;
}

/**
 * Marks attendance for a batch of students in one call, e.g.
 * [{ studentId, status: "PRESENT" }, { studentId, status: "ABSENT" }, ...]
 * Upserts so re-submitting corrections is safe.
 */
async function markAttendance(sessionId, records) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) throw { status: 404, msg: "Session not found" };

  const results = await Promise.all(
    records.map(({ studentId, status }) =>
      prisma.sessionAttendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        update: { status },
        create: { sessionId, studentId, status },
      })
    )
  );
  return results;
}

module.exports = { createSession, listSessionsByGroup, getSessionWithDetails, markAttendance };
