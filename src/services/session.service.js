const prisma = require("../config/prisma");

function createHttpError(status, msg) {
  return { status, msg };
}

function parseSessionDate(value) {
  if (!value) {
    throw createHttpError(400, "Session date is required");
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw createHttpError(
      400,
      "Session date must use the YYYY-MM-DD format"
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    throw createHttpError(400, "Session date is invalid");
  }

  return date;
}

function validateSessionTitle(title) {
  const normalizedTitle =
    typeof title === "string" ? title.trim() : "";

  if (!normalizedTitle) {
    throw createHttpError(400, "Session title is required");
  }

  if (normalizedTitle.length > 200) {
    throw createHttpError(
      400,
      "Session title cannot exceed 200 characters"
    );
  }

  return normalizedTitle;
}

async function createSession({
  title,
  date,
  teacherId,
  yearId,
  groupId,
}) {
  const normalizedTitle = validateSessionTitle(title);

  if (!teacherId) {
    throw createHttpError(400, "Teacher is required");
  }

  if (!yearId) {
    throw createHttpError(400, "Year is required");
  }

  if (!groupId) {
    throw createHttpError(400, "Group is required");
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      yearId: true,
    },
  });

  if (!group) {
    throw createHttpError(404, "Group not found");
  }

  if (group.yearId !== yearId) {
    throw createHttpError(
      400,
      "The selected group does not belong to the selected year"
    );
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        title: normalizedTitle,
        date: parseSessionDate(date),
        teacherId,
        yearId,
        groupId,
      },
    });

    const members = await tx.groupMembership.findMany({
      where: { groupId },
      select: {
        studentId: true,
      },
    });

    if (members.length > 0) {
      await tx.sessionAttendance.createMany({
        data: members.map((member) => ({
          sessionId: session.id,
          studentId: member.studentId,
          status: "ABSENT",
        })),
      });
    }

    return session;
  });
}

async function listSessionsByGroup(groupId) {
  if (!groupId) {
    throw createHttpError(400, "Group is required");
  }

  return prisma.session.findMany({
    where: { groupId },
    orderBy: [
      { date: "desc" },
      { createdAt: "desc" },
    ],
    include: {
      _count: {
        select: {
          attendance: true,
          liveQuestions: true,
        },
      },
    },
  });
}

async function getSessionWithDetails(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      attendance: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          student: {
            name: "asc",
          },
        },
      },
      liveQuestions: {
        include: {
          answers: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      group: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!session) {
    throw createHttpError(404, "Session not found");
  }

  return session;
}

async function updateSession(sessionId, { title, date }) {
  const existingSession = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
    },
  });

  if (!existingSession) {
    throw createHttpError(404, "Session not found");
  }

  const normalizedTitle = validateSessionTitle(title);
  const parsedDate = parseSessionDate(date);

  return prisma.session.update({
    where: { id: sessionId },
    data: {
      title: normalizedTitle,
      date: parsedDate,
    },
  });
}

async function deleteSession(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      liveQuestions: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!session) {
    throw createHttpError(404, "Session not found");
  }

  const liveQuestionIds = session.liveQuestions.map(
    (question) => question.id
  );

  await prisma.$transaction(async (tx) => {
    if (liveQuestionIds.length > 0) {
      await tx.liveQuestionAnswer.deleteMany({
        where: {
          liveQuestionId: {
            in: liveQuestionIds,
          },
        },
      });

      await tx.liveQuestion.deleteMany({
        where: {
          id: {
            in: liveQuestionIds,
          },
        },
      });
    }

    await tx.sessionAttendance.deleteMany({
      where: {
        sessionId,
      },
    });

    await tx.session.delete({
      where: {
        id: sessionId,
      },
    });
  });
}

/**
 * Marks attendance for a batch of students in one call.
 *
 * Example:
 * [
 *   { studentId: "...", status: "PRESENT" },
 *   { studentId: "...", status: "ABSENT" }
 * ]
 */
async function markAttendance(sessionId, records) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      groupId: true,
    },
  });

  if (!session) {
    throw createHttpError(404, "Session not found");
  }

  if (!Array.isArray(records)) {
    throw createHttpError(
      400,
      "Attendance records must be an array"
    );
  }

  const allowedStatuses = new Set([
    "PRESENT",
    "ABSENT",
  ]);

  for (const record of records) {
    if (!record?.studentId) {
      throw createHttpError(
        400,
        "Every attendance record requires a studentId"
      );
    }

    if (!allowedStatuses.has(record.status)) {
      throw createHttpError(
        400,
        "Attendance status must be PRESENT or ABSENT"
      );
    }
  }

  const uniqueStudentIds = [
    ...new Set(records.map((record) => record.studentId)),
  ];

  if (uniqueStudentIds.length !== records.length) {
    throw createHttpError(
      400,
      "A student cannot appear more than once"
    );
  }

  const memberships = await prisma.groupMembership.count({
    where: {
      groupId: session.groupId,
      studentId: {
        in: uniqueStudentIds,
      },
    },
  });

  if (memberships !== uniqueStudentIds.length) {
    throw createHttpError(
      400,
      "One or more students do not belong to this session's group"
    );
  }

  return prisma.$transaction(
    records.map(({ studentId, status }) =>
      prisma.sessionAttendance.upsert({
        where: {
          sessionId_studentId: {
            sessionId,
            studentId,
          },
        },
        update: {
          status,
        },
        create: {
          sessionId,
          studentId,
          status,
        },
      })
    )
  );
}

module.exports = {
  createSession,
  listSessionsByGroup,
  getSessionWithDetails,
  updateSession,
  deleteSession,
  markAttendance,
};