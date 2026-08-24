const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");

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
        "You do not have access to this live question"
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
        "You are not assigned to this live question's group"
      );
    }

    return;
  }

  throw createHttpError(
    403,
    "You do not have access to this live question"
  );
}

/**
 * Converts the stored R2 object key into a temporary
 * signed URL that the frontend/browser can actually open.
 */
async function mapLiveQuestionAnswer(answer) {
  return {
    ...answer,

    answerImageUrl: answer.answerImageUrl
      ? await storage.getSignedUrl(
          answer.answerImageUrl,
          15
        )
      : null,
  };
}

/**
 * Teacher or authorized Assistant poses a question
 * during a live session.
 */
async function createLiveQuestion({
  sessionId,
  prompt,
  gradeOutOf,
  createdBy,
}) {
  if (!sessionId) {
    throw createHttpError(
      400,
      "Session is required"
    );
  }

  const normalizedPrompt =
    typeof prompt === "string"
      ? prompt.trim()
      : "";

  if (!normalizedPrompt) {
    throw createHttpError(
      400,
      "Question prompt is required"
    );
  }

  const numericGradeOutOf =
    Number(gradeOutOf);

  if (
    !Number.isFinite(
      numericGradeOutOf
    ) ||
    numericGradeOutOf <= 0
  ) {
    throw createHttpError(
      400,
      "gradeOutOf must be a number greater than 0"
    );
  }

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

  await assertGroupAccess(
    session.groupId,
    createdBy
  );

  return prisma.liveQuestion.create({
    data: {
      sessionId,
      prompt: normalizedPrompt,
      gradeOutOf:
        numericGradeOutOf,
    },
  });
}

/**
 * Student photographs/uploads their handwritten answer.
 */
async function submitAnswer({
  liveQuestionId,
  studentId,
  file,
}) {
  if (!file) {
    throw createHttpError(
      400,
      "No answer image provided"
    );
  }

  const question =
    await prisma.liveQuestion.findUnique({
      where: {
        id: liveQuestionId,
      },
      select: {
        id: true,

        session: {
          select: {
            groupId: true,
          },
        },
      },
    });

  if (!question) {
    throw createHttpError(
      404,
      "Live question not found"
    );
  }

  const membership =
    await prisma.groupMembership.findUnique({
      where: {
        groupId_studentId: {
          groupId:
            question.session.groupId,

          studentId,
        },
      },
      select: {
        id: true,
      },
    });

  if (!membership) {
    throw createHttpError(
      403,
      "You cannot answer a live question outside your group"
    );
  }

  const existing =
    await prisma.liveQuestionAnswer.findUnique({
      where: {
        liveQuestionId_studentId: {
          liveQuestionId,
          studentId,
        },
      },
      select: {
        id: true,
      },
    });

  if (existing) {
    throw createHttpError(
      400,
      "You've already submitted an answer for this question"
    );
  }

  /*
   * uploadBuffer() returns the stored R2 object key.
   * We intentionally store that key in the database.
   * It is signed only when returned to the frontend.
   */
  const answerImageUrl =
    await storage.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      "live-answers"
    );

  const createdAnswer =
    await prisma.liveQuestionAnswer.create({
      data: {
        liveQuestionId,
        studentId,
        answerImageUrl,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },

        gradedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

  /*
   * Return a signed URL immediately as well.
   * This keeps the API response consistent.
   */
  return mapLiveQuestionAnswer(
    createdAnswer
  );
}

/**
 * Teacher, Head Assistant, or assigned Assistant
 * grades the submitted answer.
 */
async function gradeAnswer({
  answerId,
  gradedBy,
  grade,
}) {
  const answer =
    await prisma.liveQuestionAnswer.findUnique({
      where: {
        id: answerId,
      },

      include: {
        liveQuestion: {
          include: {
            session: {
              select: {
                groupId: true,
              },
            },
          },
        },
      },
    });

  if (!answer) {
    throw createHttpError(
      404,
      "Answer not found"
    );
  }

  await assertGroupAccess(
    answer.liveQuestion
      .session.groupId,
    gradedBy
  );

  const numericGrade =
    Number(grade);

  if (
    !Number.isFinite(
      numericGrade
    )
  ) {
    throw createHttpError(
      400,
      "Grade must be numeric"
    );
  }

  if (
    numericGrade < 0 ||
    numericGrade >
      answer.liveQuestion
        .gradeOutOf
  ) {
    throw createHttpError(
      400,
      `Grade must be between 0 and ${answer.liveQuestion.gradeOutOf}`
    );
  }

  const graded =
    await prisma.liveQuestionAnswer.update({
      where: {
        id: answerId,
      },

      data: {
        grade: numericGrade,
        status: "GRADED",
        gradedById:
          gradedBy.id,
        gradedAt:
          new Date(),
      },

      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },

        gradedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

  notify({
    userId:
      answer.studentId,

    type:
      "GRADE_POSTED",

    title:
      "Your answer was graded",

    body:
      `You scored ${numericGrade}/` +
      `${answer.liveQuestion.gradeOutOf} on ` +
      `"${answer.liveQuestion.prompt}"`,

    link:
      `/live-questions/${answer.liveQuestionId}`,
  }).catch((err) =>
    console.error(
      "notify() failed:",
      err.message
    )
  );

  /*
   * Keep returned answer consistent with listAnswersForQuestion().
   */
  return mapLiveQuestionAnswer(
    graded
  );
}

/**
 * Returns answers visible to the requesting user.
 *
 * Teacher / Head / authorized Assistant:
 *   all answers for the live question
 *
 * Student:
 *   only their own answer
 *
 * Stored R2 keys are converted to signed URLs before
 * being returned to the frontend.
 */
async function listAnswersForQuestion(
  liveQuestionId,
  user
) {
  const question =
    await prisma.liveQuestion.findUnique({
      where: {
        id: liveQuestionId,
      },

      select: {
        id: true,

        session: {
          select: {
            groupId: true,
          },
        },
      },
    });

  if (!question) {
    throw createHttpError(
      404,
      "Live question not found"
    );
  }

  await assertGroupAccess(
    question.session.groupId,
    user
  );

  const answers =
    await prisma.liveQuestionAnswer.findMany({
      where: {
        liveQuestionId,

        ...(user.role ===
        "STUDENT"
          ? {
              studentId:
                user.id,
            }
          : {}),
      },

      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },

        gradedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },

      orderBy: {
        submittedAt: "asc",
      },
    });

  return Promise.all(
    answers.map(
      mapLiveQuestionAnswer
    )
  );
}

module.exports = {
  createLiveQuestion,
  submitAnswer,
  gradeAnswer,
  listAnswersForQuestion,
};