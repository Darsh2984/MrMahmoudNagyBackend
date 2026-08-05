const prisma = require(
  "../config/prisma",
);

const {
  getSignedUrl,
} = require("./storage.service");

function createServiceError(
  status,
  msg,
  data,
) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  if (data !== undefined) {
    error.data = data;
  }

  return error;
}

function normalizeAnswer(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .toUpperCase();
}

function normalizeStoredAnswers(
  value,
) {
  if (Array.isArray(value)) {
    return value.filter(
      (answer) =>
        answer &&
        typeof answer === "object" &&
        typeof answer.questionId ===
          "string",
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.entries(value).map(
      ([questionId, answerText]) => ({
        questionId,
        answerText,
      }),
    );
  }

  return [];
}

function getTotalPoints(quiz) {
  const storedTotal =
    Number(quiz?.totalPoints);

  if (
    Number.isFinite(storedTotal) &&
    storedTotal >= 0
  ) {
    return storedTotal;
  }

  return (
    quiz?.questions || []
  ).reduce(
    (total, quizQuestion) =>
      total +
      Number(
        quizQuestion?.points || 0,
      ),
    0,
  );
}

async function mapPrivateFile(file) {
  return {
    id: file.id,

    originalName:
      file.originalName,

    contentType:
      file.contentType,

    size:
      file.size,

    order:
      file.order,

    uploadedAt:
      file.uploadedAt,

    fileUrl:
      await getSignedUrl(
        file.objectKey,
        10,
      ),
  };
}

async function getStudentQuizReview({
  quizId,
  studentId,
}) {
  const submission =
    await prisma.quizSubmission.findFirst(
      {
        where: {
          quizId,
          studentId,
        },

        include: {
          quiz: {
            include: {
              questions: {
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
                      questionFileUrl:
                        true,

                      /*
                       * Safe only because
                       * this response is
                       * returned after an
                       * MCQ submission.
                       */
                      correctAnswer:
                        true,

                      /*
                       * Do not select
                       * markschemeFileUrl.
                       * Students must never
                       * receive it.
                       */
                    },
                  },
                },
              },
            },
          },

          paperFiles: {
            orderBy: {
              order: "asc",
            },
          },

          correctedPaperFiles: {
            orderBy: {
              order: "asc",
            },
          },

          gradedBy: {
            select: {
              id: true,
              name: true,
              role: true,
              isHeadAssistant:
                true,
            },
          },
        },
      },
    );

  if (!submission) {
    throw createServiceError(
      404,
      "Quiz submission not found.",
    );
  }

  if (!submission.isSubmitted) {
    throw createServiceError(
      403,
      "The quiz must be submitted before it can be reviewed.",
    );
  }

  const quiz = submission.quiz;

  const totalPoints =
    getTotalPoints(quiz);

  const baseResponse = {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description:
        quiz.description,

      type: quiz.type,

      totalPoints,

      durationMinutes:
        quiz.durationMinutes,

      startAt: quiz.startAt,
      endAt: quiz.endAt,
    },

    submission: {
      id: submission.id,

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

      score:
        submission.score === null ||
        submission.score === undefined
          ? null
          : Number(
              submission.score,
            ),

      totalPoints,

      isGraded:
        submission.isGraded,

      gradedAt:
        submission.gradedAt,

      gradedBy:
        submission.gradedBy,

      gradingComments:
        submission.gradingComments,
    },
  };

  if (quiz.type === "MCQ") {
    const storedAnswers =
      normalizeStoredAnswers(
        submission.answers,
      );

    const answerMap = new Map(
      storedAnswers.map(
        (answer) => [
          String(
            answer.questionId,
          ),

          normalizeAnswer(
            answer.answerText ??
              answer.answer ??
              answer.selectedAnswer,
          ),
        ],
      ),
    );

    const questions =
      await Promise.all(
        quiz.questions.map(
          async (
            quizQuestion,
            index,
          ) => {
            const question =
              quizQuestion.question;

            const studentAnswer =
              answerMap.get(
                String(question.id),
              ) || "";

            const correctAnswer =
              normalizeAnswer(
                question.correctAnswer,
              );

            const answered =
              Boolean(studentAnswer);

            const isCorrect =
              answered &&
              Boolean(correctAnswer) &&
              studentAnswer ===
                correctAnswer;

            const points =
              Number(
                quizQuestion.points ||
                  0,
              );

            return {
              quizQuestionId:
                quizQuestion.id,

              questionId:
                question.id,

              number: index + 1,

              title:
                question.title,

              reference:
                question.reference,

              type:
                question.type,

              points,

              studentAnswer:
                studentAnswer || null,

              correctAnswer:
                correctAnswer || null,

              answered,
              isCorrect,

              earnedPoints:
                isCorrect
                  ? points
                  : 0,

              questionFileUrl:
                question
                  .questionFileUrl
                  ? await getSignedUrl(
                      question
                        .questionFileUrl,
                      10,
                    )
                  : null,
            };
          },
        ),
      );

    return {
      ...baseResponse,

      reviewType: "MCQ",

      mcqReview: {
        questions,

        correctCount:
          questions.filter(
            (question) =>
              question.isCorrect,
          ).length,

        incorrectCount:
          questions.filter(
            (question) =>
              question.answered &&
              !question.isCorrect,
          ).length,

        unansweredCount:
          questions.filter(
            (question) =>
              !question.answered,
          ).length,
      },
    };
  }

  if (quiz.type !== "PAPER") {
    throw createServiceError(
      400,
      "Unsupported quiz type.",
    );
  }

  const answerFiles =
    await Promise.all(
      submission.paperFiles.map(
        mapPrivateFile,
      ),
    );

  const correctedFiles =
    await Promise.all(
      submission
        .correctedPaperFiles
        .map(mapPrivateFile),
    );

  return {
    ...baseResponse,

    reviewType: "PAPER",

    paperReview: {
      answerFiles,

      /*
       * These files were uploaded by
       * the grader specifically for the
       * student to receive.
       */
      correctedFiles,

      isAwaitingGrading:
        !submission.isGraded,

      /*
       * No questions or markscheme
       * URLs are returned here.
       */
    },
  };
}

module.exports = {
  getStudentQuizReview,
};