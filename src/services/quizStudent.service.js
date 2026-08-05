const prisma = require("../config/prisma");
const { notify } = require("./notification.service");
const {
  sendExternalMessage,
} = require("./messaging.service");

const MCQ_OPTIONS = new Set([
  "A",
  "B",
  "C",
  "D",
]);

function createServiceError(status, msg, data) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  if (data !== undefined) {
    error.data = data;
  }

  return error;
}

function normalizeAnswer(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
}

function normalizeAnswers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (answer) =>
      answer &&
      typeof answer === "object" &&
      typeof answer.questionId === "string"
  );
}

function getQuizTotalPoints(quiz) {
  if (
    Number.isFinite(Number(quiz.totalPoints)) &&
    Number(quiz.totalPoints) > 0
  ) {
    return Number(quiz.totalPoints);
  }

  return (quiz.questions || []).reduce(
    (total, item) =>
      total + Number(item.points || 0),
    0
  );
}

function getAttemptExpiry({
  startedAt,
  durationMinutes,
  quizEndAt,
}) {
  const durationExpiry = new Date(
    startedAt.getTime() +
      Number(durationMinutes) * 60 * 1000
  );

  if (!quizEndAt) {
    return durationExpiry;
  }

  const scheduledEnd = new Date(quizEndAt);

  return durationExpiry < scheduledEnd
    ? durationExpiry
    : scheduledEnd;
}

function getQuizAvailability(quiz, now = new Date()) {
  if (quiz.status === "DRAFT") {
    return {
      code: "UNAVAILABLE",
      canStart: false,
      canContinue: false,
      message: "This quiz has not been published.",
    };
  }

  if (
    quiz.startAt &&
    now < new Date(quiz.startAt)
  ) {
    return {
      code: "UPCOMING",
      canStart: false,
      canContinue: false,
      message: "This quiz has not started yet.",
    };
  }

  if (
    quiz.status === "CLOSED" ||
    (quiz.endAt &&
      now >= new Date(quiz.endAt))
  ) {
    return {
      code: "CLOSED",
      canStart: false,
      canContinue: false,
      message: "This quiz is closed.",
    };
  }

  if (quiz.status !== "PUBLISHED") {
    return {
      code: "UNAVAILABLE",
      canStart: false,
      canContinue: false,
      message: "This quiz is unavailable.",
    };
  }

  return {
    code: "AVAILABLE",
    canStart: true,
    canContinue: true,
    message: "This quiz is available.",
  };
}

async function getStudentGroupIds(studentId) {
  const memberships =
    await prisma.groupMembership.findMany({
      where: {
        studentId,
      },

      select: {
        groupId: true,
      },
    });

  return memberships.map(
    (membership) => membership.groupId
  );
}

async function getAssignedQuiz({
  quizId,
  studentId,
  includeQuestions = false,
}) {
  const groupIds =
    await getStudentGroupIds(studentId);

  if (!groupIds.length) {
    throw createServiceError(
      403,
      "You are not currently assigned to a Group."
    );
  }

  const quiz = await prisma.quiz.findFirst({
    where: {
      id: quizId,

      groups: {
        some: {
          groupId: {
            in: groupIds,
          },
        },
      },
    },

    include: {
      groups: {
        include: {
          group: {
            select: {
              id: true,
              name: true,
              yearId: true,

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

      questions: includeQuestions
        ? {
            orderBy: {
              order: "asc",
            },

            include: {
              question: {
                select: {
                  id: true,
                  title: true,
                  reference: true,
                  type: true,
                  questionFileUrl: true,
                  correctAnswer: true,
                },
              },
            },
          }
        : false,
    },
  });

  if (!quiz) {
    throw createServiceError(
      404,
      "Quiz not found or not assigned to your Group."
    );
  }

  return quiz;
}

async function calculateSubmissionScore({
  quiz,
  answers,
}) {
  const answerMap = new Map(
    normalizeAnswers(answers).map((answer) => [
      answer.questionId,
      normalizeAnswer(answer.answerText),
    ])
  );

  let score = 0;

  for (const quizQuestion of quiz.questions) {
    const question = quizQuestion.question;

    if (
      !question ||
      question.type !== "MCQ"
    ) {
      continue;
    }

    const studentAnswer =
      answerMap.get(question.id) || "";

    const correctAnswer =
      normalizeAnswer(
        question.correctAnswer
      );

    if (
      studentAnswer &&
      correctAnswer &&
      studentAnswer === correctAnswer
    ) {
      score += Number(
        quizQuestion.points || 0
      );
    }
  }

  return score;
}

async function finalizeSubmission({
  submission,
  quiz,
  isAutoSubmitted,
}) {
  if (submission.isSubmitted) {
    return submission;
  }

  const answers = normalizeAnswers(
    submission.answers
  );

  const score =
    await calculateSubmissionScore({
      quiz,
      answers,
    });

  return prisma.quizSubmission.update({
    where: {
      id: submission.id,
    },

    data: {
      answers,
      score,
      isSubmitted: true,
      isAutoSubmitted:
        Boolean(isAutoSubmitted),
      submittedAt: new Date(),
    },
  });
}

async function sendSubmissionNotifications({
  quiz,
  studentId,
  submission,
}) {
  const totalPoints =
    getQuizTotalPoints(quiz);

  notify({
    userId: studentId,
    type: "GRADE_POSTED",
    title: "Quiz submitted",
    body: `"${quiz.title}" — score: ${submission.score}/${totalPoints}`,
    link: `/quizzes/${quiz.id}`,
  }).catch((error) => {
    console.error(
      "Quiz notification failed:",
      error.message
    );
  });

  const student =
    await prisma.user.findUnique({
      where: {
        id: studentId,
      },

      select: {
        phone: true,
      },
    });

  if (student?.phone) {
    sendExternalMessage(
      student.phone,
      [
        "✅ Quiz Finished!",
        "",
        `Title: ${quiz.title}`,
        `Score: ${submission.score}/${totalPoints}`,
      ].join("\n")
    ).catch(() => {});
  }
}

async function autoSubmitIfExpired({
  submission,
  quiz,
}) {
  if (
    !submission ||
    submission.isSubmitted ||
    !submission.expiresAt
  ) {
    return submission;
  }

  if (
    new Date() <
    new Date(submission.expiresAt)
  ) {
    return submission;
  }

  const updated =
    await finalizeSubmission({
      submission,
      quiz,
      isAutoSubmitted: true,
    });

  sendSubmissionNotifications({
    quiz,
    studentId: submission.studentId,
    submission: updated,
  }).catch((error) => {
    console.error(
      "Auto-submit notification failed:",
      error.message
    );
  });

  return updated;
}

async function listQuizzesForStudent(
  studentId
) {
  const groupIds =
    await getStudentGroupIds(studentId);

  if (!groupIds.length) {
    return [];
  }

  const quizzes =
    await prisma.quiz.findMany({
      where: {
        status: {
          in: [
            "PUBLISHED",
            "CLOSED",
          ],
        },

        groups: {
          some: {
            groupId: {
              in: groupIds,
            },
          },
        },
      },

      include: {
        groups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                yearId: true,

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
          },
        },
      },

      orderBy: [
        {
          startAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

  if (!quizzes.length) {
    return [];
  }

  const quizIds = quizzes.map(
    (quiz) => quiz.id
  );

  const submissions =
    await prisma.quizSubmission.findMany({
      where: {
        studentId,

        quizId: {
          in: quizIds,
        },
      },
    });

  const submissionMap = new Map(
    submissions.map((submission) => [
      submission.quizId,
      submission,
    ])
  );

  const results = [];

  for (const quiz of quizzes) {
    let submission =
      submissionMap.get(quiz.id) || null;

    if (
      submission &&
      !submission.isSubmitted
    ) {
      const fullQuiz =
        await getAssignedQuiz({
          quizId: quiz.id,
          studentId,
          includeQuestions: true,
        });

      submission =
        await autoSubmitIfExpired({
          submission,
          quiz: fullQuiz,
        });
    }

    const availability =
      getQuizAvailability(quiz);

    let state = availability.code;

    if (submission?.isSubmitted) {
      state = "COMPLETED";
    } else if (submission) {
      state = "IN_PROGRESS";
    }

    results.push({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      type: quiz.type,
      status: quiz.status,
      durationMinutes:
        quiz.durationMinutes,
      startAt: quiz.startAt,
      endAt: quiz.endAt,
      totalPoints:
        Number(quiz.totalPoints || 0),
      totalQuestions:
        quiz._count.questions,
      groups: quiz.groups,
      state,
      availabilityMessage:
        availability.message,
      canStart:
        !submission &&
        availability.canStart &&
        quiz.type === "MCQ",
      canContinue:
        Boolean(
          submission &&
            !submission.isSubmitted &&
            availability.canContinue &&
            quiz.type === "MCQ"
        ),
      hasStarted:
        Boolean(submission),
      alreadySubmitted:
        Boolean(
          submission?.isSubmitted
        ),
      isAutoSubmitted:
        Boolean(
          submission?.isAutoSubmitted
        ),
      score:
        submission?.isSubmitted
          ? Number(submission.score)
          : null,
      startedAt:
        submission?.startedAt || null,
      expiresAt:
        submission?.expiresAt || null,
      submittedAt:
        submission?.submittedAt || null,
      serverTime:
        new Date().toISOString(),
    });
  }

  return results;
}

async function startQuiz(
  quizId,
  studentId
) {
  const quiz = await getAssignedQuiz({
    quizId,
    studentId,
    includeQuestions: true,
  });

  if (quiz.type !== "MCQ") {
    throw createServiceError(
      400,
      "This endpoint currently supports MCQ quizzes only."
    );
  }

  if (!quiz.questions.length) {
    throw createServiceError(
      400,
      "This quiz has no questions."
    );
  }

  const availability =
    getQuizAvailability(quiz);

  let existing =
    await prisma.quizSubmission.findUnique({
      where: {
        quizId_studentId: {
          quizId,
          studentId,
        },
      },
    });

  if (existing) {
    existing =
      await autoSubmitIfExpired({
        submission: existing,
        quiz,
      });

    if (existing.isSubmitted) {
      return {
        msg: existing.isAutoSubmitted
          ? "Quiz was automatically submitted because time expired."
          : "Quiz already submitted.",
        alreadyStarted: true,
        alreadySubmitted: true,
        submissionId: existing.id,
        startedAt: existing.startedAt,
        expiresAt: existing.expiresAt,
        submittedAt: existing.submittedAt,
        score: Number(existing.score),
        totalPoints:
          getQuizTotalPoints(quiz),
        serverTime:
          new Date().toISOString(),
      };
    }

    if (!availability.canContinue) {
      const finalized =
        await finalizeSubmission({
          submission: existing,
          quiz,
          isAutoSubmitted: true,
        });

      sendSubmissionNotifications({
        quiz,
        studentId,
        submission: finalized,
      }).catch(() => {});

      return {
        msg: "Quiz was automatically submitted because it is no longer available.",
        alreadyStarted: true,
        alreadySubmitted: true,
        submissionId: finalized.id,
        startedAt: finalized.startedAt,
        expiresAt: finalized.expiresAt,
        submittedAt: finalized.submittedAt,
        score: Number(finalized.score),
        totalPoints:
          getQuizTotalPoints(quiz),
        serverTime:
          new Date().toISOString(),
      };
    }

    return {
      msg: "Quiz already started.",
      alreadyStarted: true,
      alreadySubmitted: false,
      submissionId: existing.id,
      startedAt: existing.startedAt,
      expiresAt: existing.expiresAt,
      serverTime:
        new Date().toISOString(),
    };
  }

  if (!availability.canStart) {
    throw createServiceError(
      403,
      availability.message,
      {
        state: availability.code,
        startAt: quiz.startAt,
        endAt: quiz.endAt,
      }
    );
  }

  const startedAt = new Date();

  const expiresAt =
    getAttemptExpiry({
      startedAt,
      durationMinutes:
        quiz.durationMinutes,
      quizEndAt: quiz.endAt,
    });

  const submission =
    await prisma.quizSubmission.create({
      data: {
        quizId,
        studentId,
        answers: [],
        score: 0,
        startedAt,
        expiresAt,
        isSubmitted: false,
        isAutoSubmitted: false,
      },
    });

  return {
    msg: "Quiz started.",
    alreadyStarted: false,
    alreadySubmitted: false,
    submissionId: submission.id,
    startedAt:
      submission.startedAt,
    expiresAt:
      submission.expiresAt,
    serverTime:
      new Date().toISOString(),
  };
}

async function getQuizForTaking(
  quizId,
  studentId
) {
  const quiz = await getAssignedQuiz({
    quizId,
    studentId,
    includeQuestions: true,
  });

  if (quiz.type !== "MCQ") {
    throw createServiceError(
      400,
      "This endpoint currently supports MCQ quizzes only."
    );
  }

  let submission =
    await prisma.quizSubmission.findUnique({
      where: {
        quizId_studentId: {
          quizId,
          studentId,
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      400,
      "Start the quiz before loading its questions."
    );
  }

  submission =
    await autoSubmitIfExpired({
      submission,
      quiz,
    });

  const availability =
    getQuizAvailability(quiz);

  if (
    !submission.isSubmitted &&
    !availability.canContinue
  ) {
    submission =
      await finalizeSubmission({
        submission,
        quiz,
        isAutoSubmitted: true,
      });

    sendSubmissionNotifications({
      quiz,
      studentId,
      submission,
    }).catch(() => {});
  }

  const answers = normalizeAnswers(
    submission.answers
  ).map((answer) => ({
    questionId: answer.questionId,
    answerText:
      answer.answerText || null,
  }));

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    type: quiz.type,
    status: quiz.status,
    durationMinutes:
      quiz.durationMinutes,
    startAt: quiz.startAt,
    endAt: quiz.endAt,
    totalPoints:
      getQuizTotalPoints(quiz),
    startedAt:
      submission.startedAt,
    expiresAt:
      submission.expiresAt,
    submittedAt:
      submission.submittedAt,
    isSubmitted:
      submission.isSubmitted,
    isAutoSubmitted:
      submission.isAutoSubmitted,
    score: submission.isSubmitted
      ? Number(submission.score)
      : null,
    answers,
    serverTime:
      new Date().toISOString(),

    questions: quiz.questions.map(
      (quizQuestion) => ({
        id: quizQuestion.question.id,
        title:
          quizQuestion.question.title,
        reference:
          quizQuestion.question.reference,
        type:
          quizQuestion.question.type,
        questionFileUrl:
          quizQuestion.question
            .questionFileUrl,
        order: quizQuestion.order,
        points: Number(
          quizQuestion.points
        ),
      })
    ),
  };
}

async function answerQuestion({
  quizId,
  studentId,
  questionId,
  answerText,
}) {
  const normalizedAnswer =
    normalizeAnswer(answerText);

  if (
    !MCQ_OPTIONS.has(
      normalizedAnswer
    )
  ) {
    throw createServiceError(
      400,
      "Answer must be A, B, C, or D."
    );
  }

  const quiz = await getAssignedQuiz({
    quizId,
    studentId,
    includeQuestions: true,
  });

  if (quiz.type !== "MCQ") {
    throw createServiceError(
      400,
      "This endpoint currently supports MCQ quizzes only."
    );
  }

  let submission =
    await prisma.quizSubmission.findUnique({
      where: {
        quizId_studentId: {
          quizId,
          studentId,
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      400,
      "Start the quiz before answering questions."
    );
  }

  submission =
    await autoSubmitIfExpired({
      submission,
      quiz,
    });

  if (submission.isSubmitted) {
    throw createServiceError(
      409,
      submission.isAutoSubmitted
        ? "Time expired and the quiz was automatically submitted."
        : "Quiz already submitted."
    );
  }

  const availability =
    getQuizAvailability(quiz);

  if (!availability.canContinue) {
    const finalized =
      await finalizeSubmission({
        submission,
        quiz,
        isAutoSubmitted: true,
      });

    sendSubmissionNotifications({
      quiz,
      studentId,
      submission: finalized,
    }).catch(() => {});

    throw createServiceError(
      409,
      "The quiz is no longer available and was automatically submitted."
    );
  }

  const quizQuestion =
    quiz.questions.find(
      (item) =>
        item.questionId ===
        questionId
    );

  if (!quizQuestion) {
    throw createServiceError(
      404,
      "Question does not belong to this quiz."
    );
  }

  if (
    quizQuestion.question.type !==
    "MCQ"
  ) {
    throw createServiceError(
      400,
      "Only MCQ answers are supported in this quiz."
    );
  }

  const answers = normalizeAnswers(
    submission.answers
  );

  const updatedAnswers = [
    ...answers.filter(
      (answer) =>
        answer.questionId !==
        questionId
    ),
    {
      questionId,
      answerText:
        normalizedAnswer,
    },
  ];

  const updatedSubmission =
    await prisma.quizSubmission.update({
      where: {
        id: submission.id,
      },

      data: {
        answers: updatedAnswers,
      },
    });

  return {
    msg: "Answer saved.",
    questionId,
    answerText:
      normalizedAnswer,
    answers:
      normalizeAnswers(
        updatedSubmission.answers
      ).map((answer) => ({
        questionId:
          answer.questionId,
        answerText:
          answer.answerText,
      })),
    expiresAt:
      updatedSubmission.expiresAt,
    serverTime:
      new Date().toISOString(),
  };
}

async function submitQuiz(
  quizId,
  studentId,
  {
    isAutoSubmitted = false,
  } = {}
) {
  const quiz = await getAssignedQuiz({
    quizId,
    studentId,
    includeQuestions: true,
  });

  const submission =
    await prisma.quizSubmission.findUnique({
      where: {
        quizId_studentId: {
          quizId,
          studentId,
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Quiz was not started."
    );
  }

  if (submission.isSubmitted) {
    return {
      ...submission,
      score: Number(
        submission.score
      ),
      totalPoints:
        getQuizTotalPoints(quiz),
      serverTime:
        new Date().toISOString(),
    };
  }

  const expired =
    submission.expiresAt &&
    new Date() >=
      new Date(submission.expiresAt);

  const updated =
    await finalizeSubmission({
      submission,
      quiz,
      isAutoSubmitted:
        isAutoSubmitted || expired,
    });

  sendSubmissionNotifications({
    quiz,
    studentId,
    submission: updated,
  }).catch((error) => {
    console.error(
      "Submission notification failed:",
      error.message
    );
  });

  return {
    ...updated,
    score: Number(updated.score),
    totalPoints:
      getQuizTotalPoints(quiz),
    serverTime:
      new Date().toISOString(),
  };
}

async function getSubmissionDetail(
  quizId,
  studentId
) {
  const quiz = await getAssignedQuiz({
    quizId,
    studentId,
    includeQuestions: true,
  });

  let submission =
    await prisma.quizSubmission.findUnique({
      where: {
        quizId_studentId: {
          quizId,
          studentId,
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Submission not found."
    );
  }

  submission =
    await autoSubmitIfExpired({
      submission,
      quiz,
    });

  return {
    id: submission.id,
    quizId: submission.quizId,
    studentId:
      submission.studentId,
    answers: normalizeAnswers(
      submission.answers
    ).map((answer) => ({
      questionId:
        answer.questionId,
      answerText:
        answer.answerText || null,
    })),
    score: submission.isSubmitted
      ? Number(submission.score)
      : null,
    totalPoints:
      getQuizTotalPoints(quiz),
    startedAt:
      submission.startedAt,
    expiresAt:
      submission.expiresAt,
    submittedAt:
      submission.submittedAt,
    isSubmitted:
      submission.isSubmitted,
    isAutoSubmitted:
      submission.isAutoSubmitted,
    serverTime:
      new Date().toISOString(),
  };
}

async function listSubmissionsForQuiz(
  quizId
) {
  const quiz =
    await prisma.quiz.findUnique({
      where: {
        id: quizId,
      },

      include: {
        questions: true,
      },
    });

  if (!quiz) {
    throw createServiceError(
      404,
      "Quiz not found."
    );
  }

  const submissions =
    await prisma.quizSubmission.findMany({
      where: {
        quizId,
      },

      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },

      orderBy: {
        startedAt: "desc",
      },
    });

  return submissions.map(
    (submission) => ({
      id: submission.id,
      student: submission.student,
      score: submission.isSubmitted
        ? Number(submission.score)
        : null,
      totalPoints:
        Number(quiz.totalPoints || 0),
      isSubmitted:
        submission.isSubmitted,
      isAutoSubmitted:
        submission.isAutoSubmitted,
      startedAt:
        submission.startedAt,
      expiresAt:
        submission.expiresAt,
      submittedAt:
        submission.submittedAt,
    })
  );
}

module.exports = {
  listQuizzesForStudent,
  startQuiz,
  getQuizForTaking,
  answerQuestion,
  submitQuiz,
  getSubmissionDetail,
  listSubmissionsForQuiz,
};