const prisma = require("../config/prisma");

const QUIZ_TYPES = ["MCQ", "PAPER"];
const QUIZ_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"];

function createServiceError(status, msg) {
  const error = new Error(msg);
  error.status = status;
  error.msg = msg;
  return error;
}

function normalizeText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeQuizType(value) {
  const type = normalizeText(value).toUpperCase();

  if (!QUIZ_TYPES.includes(type)) {
    throw createServiceError(
      400,
      "Quiz type must be MCQ or PAPER"
    );
  }

  return type;
}

function normalizeQuizStatus(value) {
  const status = normalizeText(value).toUpperCase();

  if (!QUIZ_STATUSES.includes(status)) {
    throw createServiceError(
      400,
      "Invalid quiz status"
    );
  }

  return status;
}

function normalizeDuration(value) {
  const duration = Number(value);

  if (
    !Number.isInteger(duration) ||
    duration <= 0
  ) {
    throw createServiceError(
      400,
      "Quiz duration must be a positive whole number of minutes"
    );
  }

  return duration;
}

function normalizePoints(value) {
  const points = Number(value);

  if (
    !Number.isFinite(points) ||
    points <= 0
  ) {
    throw createServiceError(
      400,
      "Question points must be greater than zero"
    );
  }

  return points;
}

function normalizeDate(value, fieldName) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createServiceError(
      400,
      `${fieldName} must be a valid date`
    );
  }

  return date;
}

function normalizeIdArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw createServiceError(
      400,
      `${fieldName} must be an array`
    );
  }

  return [
    ...new Set(
      value
        .map((item) =>
          typeof item === "string"
            ? item.trim()
            : ""
        )
        .filter(Boolean)
    ),
  ];
}

function normalizeQuestionInput(value) {
  if (!Array.isArray(value)) {
    throw createServiceError(
      400,
      "questions must be an array"
    );
  }

  const seenQuestionIds = new Set();

  return value.map((item, index) => {
    const questionId =
      typeof item?.questionId === "string"
        ? item.questionId.trim()
        : "";

    if (!questionId) {
      throw createServiceError(
        400,
        `Question ${index + 1} is missing questionId`
      );
    }

    if (seenQuestionIds.has(questionId)) {
      throw createServiceError(
        400,
        "The same question cannot be added more than once"
      );
    }

    seenQuestionIds.add(questionId);

    return {
      questionId,
      points: normalizePoints(item.points),
      order: index + 1,
    };
  });
}

function validateQuizWindow({
  startAt,
  endAt,
}) {
  if (
    startAt &&
    endAt &&
    endAt <= startAt
  ) {
    throw createServiceError(
      400,
      "Quiz end time must be after its start time"
    );
  }
}

async function assertTeacherExists(teacherId) {
  const teacher = await prisma.user.findFirst({
    where: {
      id: teacherId,
      role: "TEACHER",
    },

    select: {
      id: true,
    },
  });

  if (!teacher) {
    throw createServiceError(
      404,
      "Teacher account not found"
    );
  }
}

async function validateGroups(
  teacherId,
  groupIds
) {
  if (!groupIds.length) {
    return;
  }

  const groups = await prisma.group.findMany({
    where: {
      id: {
        in: groupIds,
      },

      year: {
        teacherId,
      },
    },

    select: {
      id: true,
    },
  });

  if (groups.length !== groupIds.length) {
    throw createServiceError(
      400,
      "One or more selected groups do not belong to this teacher"
    );
  }
}

async function validateQuestions(
  teacherId,
  quizType,
  questions
) {
  if (!questions.length) {
    return;
  }

  const questionIds = questions.map(
    (item) => item.questionId
  );

  const storedQuestions =
    await prisma.question.findMany({
      where: {
        id: {
          in: questionIds,
        },

        teacherId,
      },

      select: {
        id: true,
        type: true,
      },
    });

  if (
    storedQuestions.length !==
    questionIds.length
  ) {
    throw createServiceError(
      400,
      "One or more selected questions do not exist"
    );
  }

  const invalidQuestion =
    storedQuestions.find((question) => {
      if (quizType === "MCQ") {
        return question.type !== "MCQ";
      }

      return question.type !== "WRITTEN";
    });

  if (invalidQuestion) {
    throw createServiceError(
      400,
      quizType === "MCQ"
        ? "MCQ quizzes can only contain MCQ questions"
        : "Paper quizzes can only contain Written questions"
    );
  }
}

async function getRawQuiz(
  quizId,
  teacherId
) {
  const quiz = await prisma.quiz.findFirst({
    where: {
      id: quizId,
      teacherId,
    },

    include: {
      groups: {
        include: {
          group: {
            include: {
              year: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },

      questions: {
        orderBy: {
          order: "asc",
        },

        include: {
          question: {
            include: {
              topics: {
                include: {
                  topic: {
                    include: {
                      chapter: {
                        include: {
                          unit: {
                            select: {
                              id: true,
                              name: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      _count: {
        select: {
          submissions: true,
        },
      },
    },
  });

  if (!quiz) {
    throw createServiceError(
      404,
      "Quiz not found"
    );
  }

  return quiz;
}

async function createQuiz({
  teacherId,
  title,
  description,
  type,
  durationMinutes,
  startAt,
  endAt,
  groupIds = [],
  questions = [],
}) {
  const normalizedTitle = normalizeText(title);

  if (!normalizedTitle) {
    throw createServiceError(
      400,
      "Quiz title is required"
    );
  }

  const normalizedType =
    normalizeQuizType(type);

  const normalizedDuration =
    normalizeDuration(durationMinutes);

  const normalizedStartAt =
    normalizeDate(startAt, "startAt");

  const normalizedEndAt =
    normalizeDate(endAt, "endAt");

  validateQuizWindow({
    startAt: normalizedStartAt,
    endAt: normalizedEndAt,
  });

  const normalizedGroupIds =
    normalizeIdArray(groupIds, "groupIds");

  const normalizedQuestions =
    normalizeQuestionInput(questions);

  await assertTeacherExists(teacherId);

  await Promise.all([
    validateGroups(
      teacherId,
      normalizedGroupIds
    ),

    validateQuestions(
      teacherId,
      normalizedType,
      normalizedQuestions
    ),
  ]);

  const totalPoints =
    normalizedQuestions.reduce(
      (sum, item) => sum + item.points,
      0
    );

  const quiz = await prisma.quiz.create({
    data: {
      title: normalizedTitle,

      description:
        normalizeOptionalText(description),

      type: normalizedType,
      status: "DRAFT",

      teacherId,

      durationMinutes:
        normalizedDuration,

      startAt: normalizedStartAt,
      endAt: normalizedEndAt,

      totalPoints,

      groups: {
        create: normalizedGroupIds.map(
          (groupId) => ({
            groupId,
          })
        ),
      },

      questions: {
        create: normalizedQuestions.map(
          (item) => ({
            questionId:
              item.questionId,

            points: item.points,
            order: item.order,
          })
        ),
      },
    },
  });

  return getRawQuiz(
    quiz.id,
    teacherId
  );
}

async function listQuizzes(
  teacherId,
  {
    status,
    type,
    groupId,
    search,
  } = {}
) {
  const normalizedSearch =
    normalizeText(search);

  const normalizedStatus = status
    ? normalizeQuizStatus(status)
    : null;

  const normalizedType = type
    ? normalizeQuizType(type)
    : null;

  return prisma.quiz.findMany({
    where: {
      teacherId,

      ...(normalizedStatus
        ? {
            status: normalizedStatus,
          }
        : {}),

      ...(normalizedType
        ? {
            type: normalizedType,
          }
        : {}),

      ...(groupId
        ? {
            groups: {
              some: {
                groupId,
              },
            },
          }
        : {}),

      ...(normalizedSearch
        ? {
            OR: [
              {
                title: {
                  contains:
                    normalizedSearch,

                  mode: "insensitive",
                },
              },

              {
                description: {
                  contains:
                    normalizedSearch,

                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },

    include: {
      groups: {
        include: {
          group: {
            include: {
              year: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },

      _count: {
        select: {
          questions: true,
          submissions: true,
        },
      },
    },

    orderBy: {
      createdAt: "desc",
    },
  });
}

async function getQuiz(
  quizId,
  teacherId
) {
  return getRawQuiz(
    quizId,
    teacherId
  );
}

async function updateQuiz(
  quizId,
  teacherId,
  {
    title,
    description,
    type,
    durationMinutes,
    startAt,
    endAt,
    groupIds,
    questions,
  }
) {
  const existingQuiz =
    await getRawQuiz(
      quizId,
      teacherId
    );

  const hasStartedAttempts =
    existingQuiz._count.submissions > 0;

  const normalizedTitle =
    title === undefined
      ? existingQuiz.title
      : normalizeText(title);

  if (!normalizedTitle) {
    throw createServiceError(
      400,
      "Quiz title is required"
    );
  }

  const normalizedType =
    type === undefined
      ? existingQuiz.type
      : normalizeQuizType(type);

  const normalizedDuration =
    durationMinutes === undefined
      ? existingQuiz.durationMinutes
      : normalizeDuration(
          durationMinutes
        );

  const normalizedStartAt =
    startAt === undefined
      ? existingQuiz.startAt
      : normalizeDate(
          startAt,
          "startAt"
        );

  const normalizedEndAt =
    endAt === undefined
      ? existingQuiz.endAt
      : normalizeDate(
          endAt,
          "endAt"
        );

  validateQuizWindow({
    startAt: normalizedStartAt,
    endAt: normalizedEndAt,
  });

  let normalizedGroupIds = null;

  if (groupIds !== undefined) {
    normalizedGroupIds =
      normalizeIdArray(
        groupIds,
        "groupIds"
      );

    await validateGroups(
      teacherId,
      normalizedGroupIds
    );
  }

  let normalizedQuestions = null;

  if (questions !== undefined) {
    if (hasStartedAttempts) {
      throw createServiceError(
        400,
        "Quiz questions cannot be changed after a student has started an attempt"
      );
    }

    normalizedQuestions =
      normalizeQuestionInput(
        questions
      );

    await validateQuestions(
      teacherId,
      normalizedType,
      normalizedQuestions
    );
  } else if (
    type !== undefined &&
    normalizedType !==
      existingQuiz.type
  ) {
    if (hasStartedAttempts) {
      throw createServiceError(
        400,
        "Quiz type cannot be changed after a student has started an attempt"
      );
    }

    const currentQuestionInput =
      existingQuiz.questions.map(
        (item) => ({
          questionId:
            item.questionId,

          points: item.points,
        })
      );

    await validateQuestions(
      teacherId,
      normalizedType,
      currentQuestionInput
    );
  }

  const totalPoints =
    normalizedQuestions
      ? normalizedQuestions.reduce(
          (sum, item) =>
            sum + item.points,
          0
        )
      : existingQuiz.totalPoints;

  await prisma.$transaction(
    async (tx) => {
      if (normalizedGroupIds) {
        await tx.quizGroup.deleteMany({
          where: {
            quizId,
          },
        });
      }

      if (normalizedQuestions) {
        await tx.quizQuestion.deleteMany({
          where: {
            quizId,
          },
        });
      }

      await tx.quiz.update({
        where: {
          id: quizId,
        },

        data: {
          title: normalizedTitle,

          description:
            description === undefined
              ? existingQuiz.description
              : normalizeOptionalText(
                  description
                ),

          type: normalizedType,

          durationMinutes:
            normalizedDuration,

          startAt:
            normalizedStartAt,

          endAt:
            normalizedEndAt,

          totalPoints,

          ...(normalizedGroupIds
            ? {
                groups: {
                  create:
                    normalizedGroupIds.map(
                      (groupId) => ({
                        groupId,
                      })
                    ),
                },
              }
            : {}),

          ...(normalizedQuestions
            ? {
                questions: {
                  create:
                    normalizedQuestions.map(
                      (item) => ({
                        questionId:
                          item.questionId,

                        points:
                          item.points,

                        order:
                          item.order,
                      })
                    ),
                },
              }
            : {}),
        },
      });
    }
  );

  return getRawQuiz(
    quizId,
    teacherId
  );
}

async function publishQuiz(
  quizId,
  teacherId
) {
  const quiz = await getRawQuiz(
    quizId,
    teacherId
  );

  if (!quiz.questions.length) {
    throw createServiceError(
      400,
      "Add at least one question before publishing the quiz"
    );
  }

  if (!quiz.groups.length) {
    throw createServiceError(
      400,
      "Assign the quiz to at least one group before publishing"
    );
  }

  if (!quiz.startAt || !quiz.endAt) {
    throw createServiceError(
      400,
      "Start time and end time are required before publishing"
    );
  }

  validateQuizWindow({
    startAt: quiz.startAt,
    endAt: quiz.endAt,
  });

  const totalPoints =
    quiz.questions.reduce(
      (sum, item) =>
        sum + Number(item.points),
      0
    );

  return prisma.quiz.update({
    where: {
      id: quizId,
    },

    data: {
      status: "PUBLISHED",
      totalPoints,
      publishedAt:
        quiz.publishedAt || new Date(),
    },
  });
}

async function closeQuiz(
  quizId,
  teacherId
) {
  const quiz = await getRawQuiz(
    quizId,
    teacherId
  );

  if (quiz.status === "DRAFT") {
    throw createServiceError(
      400,
      "A Draft quiz cannot be closed"
    );
  }

  return prisma.quiz.update({
    where: {
      id: quizId,
    },

    data: {
      status: "CLOSED",
    },
  });
}

async function reopenQuiz(
  quizId,
  teacherId
) {
  const quiz = await getRawQuiz(
    quizId,
    teacherId
  );

  if (quiz.status !== "CLOSED") {
    throw createServiceError(
      400,
      "Only a Closed quiz can be reopened"
    );
  }

  return prisma.quiz.update({
    where: {
      id: quizId,
    },

    data: {
      status: "PUBLISHED",
    },
  });
}

async function deleteQuiz(
  quizId,
  teacherId
) {
  const quiz = await getRawQuiz(
    quizId,
    teacherId
  );

  if (quiz._count.submissions > 0) {
    throw createServiceError(
      400,
      "A quiz with student attempts cannot be deleted"
    );
  }

  await prisma.quiz.delete({
    where: {
      id: quizId,
    },
  });
}

module.exports = {
  createQuiz,
  listQuizzes,
  getQuiz,
  updateQuiz,
  publishQuiz,
  closeQuiz,
  reopenQuiz,
  deleteQuiz,
};