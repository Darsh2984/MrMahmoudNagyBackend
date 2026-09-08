const prisma = require("../config/prisma");
const storage = require("./storage.service");

function createHttpError(status, msg) {
  return { status, msg };
}

function isAdminLevel(user) {
  return (
    user?.role === "TEACHER" ||
    (
      user?.role === "ASSISTANT" &&
      user?.isHeadAssistant === true
    )
  );
}

async function assertGroupAccess(groupId, user) {
  if (!user) {
    throw createHttpError(
      401,
      "Unauthorized"
    );
  }

  if (isAdminLevel(user)) {
    return;
  }

  if (user.role === "STUDENT") {
    const membership =
      await prisma.groupMembership.findUnique({
        where: {
          groupId_studentId: {
            groupId,
            studentId: user.id,
          },
        },
        select: {
          id: true,
        },
      });

    if (!membership) {
      throw createHttpError(
        403,
        "You do not have access to this group"
      );
    }

    return;
  }

  if (user.role === "ASSISTANT") {
    const assignment =
      await prisma.assistantGroupAssignment.findUnique({
        where: {
          assistantId_groupId: {
            assistantId: user.id,
            groupId,
          },
        },
        select: {
          id: true,
        },
      });

    if (!assignment) {
      throw createHttpError(
        403,
        "You are not assigned to this group"
      );
    }

    return;
  }

  throw createHttpError(
    403,
    "You do not have access to this group"
  );
}

function parseSessionDate(value) {
  if (!value) {
    throw createHttpError(
      400,
      "Session date is required"
    );
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value
    );

  if (!match) {
    throw createHttpError(
      400,
      "Session date must use the YYYY-MM-DD format"
    );
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    throw createHttpError(
      400,
      "Session date is invalid"
    );
  }

  return date;
}

function validateSessionTitle(title) {
  const normalizedTitle =
    typeof title === "string"
      ? title.trim()
      : "";

  if (!normalizedTitle) {
    throw createHttpError(
      400,
      "Session title is required"
    );
  }

  if (
    normalizedTitle.length > 200
  ) {
    throw createHttpError(
      400,
      "Session title cannot exceed 200 characters"
    );
  }

  return normalizedTitle;
}

/**
 * Convert stored answer object keys into signed URLs.
 *
 * The database continues storing:
 * live-answers/abc.jpeg
 *
 * The frontend receives:
 * https://...signed-url...
 */
async function signLiveQuestionAnswers(
  liveQuestions
) {
  if (
    !Array.isArray(liveQuestions)
  ) {
    return [];
  }

  return Promise.all(
    liveQuestions.map(
      async (question) => {
        const answers =
          Array.isArray(
            question.answers
          )
            ? question.answers
            : [];

        const signedAnswers =
          await Promise.all(
            answers.map(
              async (answer) => ({
                ...answer,

                answerImageUrl:
                  answer.answerImageUrl
                    ? await storage.getSignedUrl(
                        answer.answerImageUrl,
                        15
                      )
                    : null,
              })
            )
          );

        return {
          ...question,
          questionImageUrl:
            question.questionImageUrl
              ? await storage.getSignedUrl(
                  question.questionImageUrl,
                  15
                )
              : null,
          answers:
            signedAnswers,
        };
      }
    )
  );
}

async function createSession({
  title,
  date,
  teacherId,
  yearId,
  groupId,
}) {
  const normalizedTitle =
    validateSessionTitle(title);

  if (!teacherId) {
    throw createHttpError(
      400,
      "Teacher is required"
    );
  }

  if (!yearId) {
    throw createHttpError(
      400,
      "Year is required"
    );
  }

  if (!groupId) {
    throw createHttpError(
      400,
      "Group is required"
    );
  }

  const group =
    await prisma.group.findUnique({
      where: {
        id: groupId,
      },

      select: {
        id: true,
        yearId: true,
      },
    });

  if (!group) {
    throw createHttpError(
      404,
      "Group not found"
    );
  }

  if (
    group.yearId !== yearId
  ) {
    throw createHttpError(
      400,
      "The selected group does not belong to the selected year"
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const session =
        await tx.session.create({
          data: {
            title:
              normalizedTitle,

            date:
              parseSessionDate(
                date
              ),

            teacherId,
            yearId,
            groupId,
          },
        });

      const members =
        await tx.groupMembership.findMany({
          where: {
            groupId,
          },

          select: {
            studentId: true,
          },
        });

      if (
        members.length > 0
      ) {
        await tx.sessionAttendance.createMany({
          data:
            members.map(
              (member) => ({
                sessionId:
                  session.id,

                studentId:
                  member.studentId,

                status:
                  "ABSENT",
              })
            ),
        });
      }

      return session;
    }
  );
}

async function listSessionsByGroup(
  groupId,
  user
) {
  if (!groupId) {
    throw createHttpError(
      400,
      "Group is required"
    );
  }

  await assertGroupAccess(
    groupId,
    user
  );

  return prisma.session.findMany({
    where: {
      groupId,
    },

    orderBy: [
      {
        date: "desc",
      },
      {
        createdAt: "desc",
      },
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

async function getSessionWithDetails(
  sessionId,
  user
) {
  const session =
    await prisma.session.findUnique({
      where: {
        id: sessionId,
      },

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
    throw createHttpError(
      404,
      "Session not found"
    );
  }

  await assertGroupAccess(
    session.groupId,
    user
  );

  /*
   * Students only see their own
   * attendance record and their own
   * live-question answers.
   */
  if (
    user.role === "STUDENT"
  ) {
    session.attendance =
      session.attendance.filter(
        (
          attendanceRecord
        ) =>
          attendanceRecord.studentId ===
          user.id
      );

    session.liveQuestions =
      session.liveQuestions.map(
        (question) => ({
          ...question,
          correctAnswer: null,

          answers:
            question.answers.filter(
              (answer) =>
                answer.studentId ===
                user.id
            ),
        })
      );
  }

  /*
   * Critical fix:
   *
   * Convert all stored live-answer
   * R2 keys into temporary signed URLs
   * before returning the session.
   */
  session.liveQuestions =
    await signLiveQuestionAnswers(
      session.liveQuestions
    );

  return session;
}

async function updateSession(
  sessionId,
  {
    title,
    date,
  }
) {
  const existingSession =
    await prisma.session.findUnique({
      where: {
        id: sessionId,
      },

      select: {
        id: true,
      },
    });

  if (!existingSession) {
    throw createHttpError(
      404,
      "Session not found"
    );
  }

  const normalizedTitle =
    validateSessionTitle(
      title
    );

  const parsedDate =
    parseSessionDate(
      date
    );

  return prisma.session.update({
    where: {
      id: sessionId,
    },

    data: {
      title:
        normalizedTitle,

      date:
        parsedDate,
    },
  });
}

async function deleteSession(
  sessionId
) {
  const session =
    await prisma.session.findUnique({
      where: {
        id: sessionId,
      },

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
    throw createHttpError(
      404,
      "Session not found"
    );
  }

  const liveQuestionIds =
    session.liveQuestions.map(
      (question) =>
        question.id
    );

  await prisma.$transaction(
    async (tx) => {
      if (
        liveQuestionIds.length > 0
      ) {
        await tx.liveQuestionAnswer.deleteMany({
          where: {
            liveQuestionId: {
              in:
                liveQuestionIds,
            },
          },
        });

        await tx.liveQuestion.deleteMany({
          where: {
            id: {
              in:
                liveQuestionIds,
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
    }
  );
}

/**
 * Marks attendance for a batch of
 * students in one call.
 *
 * Example:
 * [
 *   {
 *     studentId: "...",
 *     status: "PRESENT"
 *   },
 *   {
 *     studentId: "...",
 *     status: "ABSENT"
 *   }
 * ]
 */
async function markAttendance(
  sessionId,
  records
) {
  const session =
    await prisma.session.findUnique({
      where: {
        id: sessionId,
      },

      select: {
        id: true,
        groupId: true,
      },
    });

  if (!session) {
    throw createHttpError(
      404,
      "Session not found"
    );
  }

  if (
    !Array.isArray(records)
  ) {
    throw createHttpError(
      400,
      "Attendance records must be an array"
    );
  }

  const allowedStatuses =
    new Set([
      "PRESENT",
      "ABSENT",
    ]);

  for (
    const record of records
  ) {
    if (!record?.studentId) {
      throw createHttpError(
        400,
        "Every attendance record requires a studentId"
      );
    }

    if (
      !allowedStatuses.has(
        record.status
      )
    ) {
      throw createHttpError(
        400,
        "Attendance status must be PRESENT or ABSENT"
      );
    }
  }

  const uniqueStudentIds = [
    ...new Set(
      records.map(
        (record) =>
          record.studentId
      )
    ),
  ];

  if (
    uniqueStudentIds.length !==
    records.length
  ) {
    throw createHttpError(
      400,
      "A student cannot appear more than once"
    );
  }

  const memberships =
    await prisma.groupMembership.count({
      where: {
        groupId:
          session.groupId,

        studentId: {
          in:
            uniqueStudentIds,
        },
      },
    });

  if (
    memberships !==
    uniqueStudentIds.length
  ) {
    throw createHttpError(
      400,
      "One or more students do not belong to this session's group"
    );
  }

  return prisma.$transaction(
    records.map(
      ({
        studentId,
        status,
      }) =>
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
