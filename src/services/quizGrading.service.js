const prisma = require(
  "../config/prisma",
);

const {
  uploadBuffer,
  deleteFile,
  getSignedUrl,
} = require(
  "./storage.service",
);

const MAX_CORRECTED_FILES = 20;

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

function normalizeComments(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const comments =
    String(value).trim();

  return comments || null;
}

function normalizeGrade(
  value,
  totalPoints,
) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    throw createServiceError(
      400,
      "Grade is required.",
    );
  }

  const grade = Number(value);

  if (!Number.isFinite(grade)) {
    throw createServiceError(
      400,
      "Grade must be a valid number.",
    );
  }

  if (grade < 0) {
    throw createServiceError(
      400,
      "Grade cannot be negative.",
    );
  }

  const maximum =
    Number(totalPoints);

  if (
    Number.isFinite(maximum) &&
    grade > maximum
  ) {
    throw createServiceError(
      400,
      `Grade cannot exceed ${maximum}.`,
    );
  }

  return grade;
}

function normalizeAnswers(
  answers,
) {
  if (Array.isArray(answers)) {
    return answers;
  }

  if (
    answers &&
    typeof answers === "object"
  ) {
    return Object.entries(
      answers,
    ).map(
      ([
        questionId,
        answerText,
      ]) => ({
        questionId,
        answerText,
      }),
    );
  }

  return [];
}

function getStudentAnswer(
  answers,
  questionId,
) {
  const answer =
    answers.find(
      (item) =>
        String(
          item?.questionId,
        ) ===
        String(questionId),
    );

  return (
    answer?.answerText ??
    answer?.answer ??
    answer?.selectedAnswer ??
    null
  );
}

async function assertQuizOwnership(
  quizId,
  teacherId,
) {
  const quiz =
    await prisma.quiz.findFirst({
      where: {
        id: quizId,
        teacherId,
      },

      include: {
        groups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,

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
            question: true,
          },
        },
      },
    });

  if (!quiz) {
    throw createServiceError(
      404,
      "Quiz not found.",
    );
  }

  return quiz;
}

function getAttemptStatus(
  submission,
) {
  if (submission.isSubmitted) {
    if (
      submission.isAutoSubmitted
    ) {
      return "AUTO_SUBMITTED";
    }

    return "SUBMITTED";
  }

  return "IN_PROGRESS";
}

async function createSignedFile(
  file,
) {
  if (!file) {
    return null;
  }

  return {
    id: file.id,

    originalName:
      file.originalName,

    contentType:
      file.contentType,

    size: file.size,

    order: file.order,

    uploadedAt:
      file.uploadedAt,

    uploadedBy:
      file.uploadedBy || null,

    url: await getSignedUrl(
      file.objectKey,
      15,
    ),
  };
}

async function listQuizSubmissions({
  quizId,
  teacherId,
}) {
  const quiz =
    await assertQuizOwnership(
      quizId,
      teacherId,
    );

  const submissions =
    await prisma.quizSubmission.findMany(
      {
        where: {
          quizId,
        },

        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,

              groupMemberships: {
                include: {
                  group: {
                    select: {
                      id: true,
                      name: true,

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
        },

        orderBy: {
          startedAt: "desc",
        },
      },
    );

  const assignedGroupIds =
    new Set(
      quiz.groups.map(
        (item) =>
          String(item.groupId),
      ),
    );

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      type: quiz.type,
      status: quiz.status,

      totalPoints:
        quiz.totalPoints,

      durationMinutes:
        quiz.durationMinutes,

      startAt: quiz.startAt,
      endAt: quiz.endAt,

      assignedGroups:
        quiz.groups.map(
          (item) => ({
            id: item.group.id,
            name: item.group.name,
            year: item.group.year,
          }),
        ),
    },

    summary: {
      totalAttempts:
        submissions.length,

      submitted:
        submissions.filter(
          (item) =>
            item.isSubmitted,
        ).length,

      inProgress:
        submissions.filter(
          (item) =>
            !item.isSubmitted,
        ).length,

      pendingPaperGrading:
        quiz.type === "PAPER"
          ? submissions.filter(
              (item) =>
                item.isSubmitted &&
                !item.isGraded,
            ).length
          : 0,

      gradedPaper:
        quiz.type === "PAPER"
          ? submissions.filter(
              (item) =>
                item.isSubmitted &&
                item.isGraded,
            ).length
          : 0,
    },

    submissions:
      submissions.map(
        (submission) => {
          const relevantGroups =
            submission.student
              .groupMemberships
              .map(
                (membership) =>
                  membership.group,
              )
              .filter((group) =>
                assignedGroupIds.has(
                  String(group.id),
                ),
              );

          return {
            id: submission.id,

            student: {
              id:
                submission.student.id,

              name:
                submission.student.name,

              email:
                submission.student
                  .email,

              phone:
                submission.student
                  .phone,

              groups:
                relevantGroups,
            },

            status:
              getAttemptStatus(
                submission,
              ),

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
              submission.score,

            totalPoints:
              quiz.totalPoints,

            isGraded:
              submission.isGraded,

            gradedAt:
              submission.gradedAt,

            gradedBy:
              submission.gradedBy,

            gradingComments:
              submission.gradingComments,

            answerFileCount:
              submission.paperFiles
                .length,

            correctedFileCount:
              submission
                .correctedPaperFiles
                .length,
          };
        },
      ),
  };
}

async function getQuizSubmissionDetail({
  quizId,
  submissionId,
  teacherId,
}) {
  const quiz =
    await assertQuizOwnership(
      quizId,
      teacherId,
    );

  const submission =
    await prisma.quizSubmission.findFirst(
      {
        where: {
          id: submissionId,
          quizId,
        },

        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,

              groupMemberships: {
                include: {
                  group: {
                    select: {
                      id: true,
                      name: true,

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

          paperFiles: {
            orderBy: {
              order: "asc",
            },
          },

          correctedPaperFiles: {
            orderBy: {
              order: "asc",
            },

            include: {
              uploadedBy: {
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
        },
      },
    );

  if (!submission) {
    throw createServiceError(
      404,
      "Quiz submission not found.",
    );
  }

  const assignedGroupIds =
    new Set(
      quiz.groups.map(
        (item) =>
          String(item.groupId),
      ),
    );

  const studentGroups =
    submission.student
      .groupMemberships
      .map(
        (membership) =>
          membership.group,
      )
      .filter((group) =>
        assignedGroupIds.has(
          String(group.id),
        ),
      );

  const baseResponse = {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description:
        quiz.description,

      type: quiz.type,

      totalPoints:
        quiz.totalPoints,

      durationMinutes:
        quiz.durationMinutes,

      startAt: quiz.startAt,
      endAt: quiz.endAt,
    },

    submission: {
      id: submission.id,

      student: {
        id: submission.student.id,
        name:
          submission.student.name,

        email:
          submission.student.email,

        phone:
          submission.student.phone,

        groups: studentGroups,
      },

      status:
        getAttemptStatus(
          submission,
        ),

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

      score: submission.score,

      totalPoints:
        quiz.totalPoints,

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
    const answers =
      normalizeAnswers(
        submission.answers,
      );

    const reviewedAnswers =
      await Promise.all(
        quiz.questions.map(
          async (
            quizQuestion,
            index,
          ) => {
            const question =
              quizQuestion.question;

            const studentAnswer =
              getStudentAnswer(
                answers,
                question.id,
              );

            const correctAnswer =
              question.correctAnswer;

            const answered =
              studentAnswer !== null &&
              studentAnswer !==
                undefined &&
              String(
                studentAnswer,
              ).trim() !== "";

            const isCorrect =
              answered &&
              String(studentAnswer)
                .trim()
                .toUpperCase() ===
                String(
                  correctAnswer || "",
                )
                  .trim()
                  .toUpperCase();

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

              points:
                quizQuestion.points,

              studentAnswer:
                studentAnswer,

              correctAnswer,

              answered,
              isCorrect,

              earnedPoints:
                isCorrect
                  ? quizQuestion.points
                  : 0,

              questionFileUrl:
                await getSignedUrl(
                  question.questionFileUrl,
                  15,
                ),
            };
          },
        ),
      );

    return {
      ...baseResponse,

      mcqReview: {
        answers:
          reviewedAnswers,

        correctCount:
          reviewedAnswers.filter(
            (item) =>
              item.isCorrect,
          ).length,

        incorrectCount:
          reviewedAnswers.filter(
            (item) =>
              item.answered &&
              !item.isCorrect,
          ).length,

        unansweredCount:
          reviewedAnswers.filter(
            (item) =>
              !item.answered,
          ).length,
      },
    };
  }

  const answerFiles =
    await Promise.all(
      submission.paperFiles.map(
        createSignedFile,
      ),
    );

  const correctedFiles =
    await Promise.all(
      submission
        .correctedPaperFiles
        .map(createSignedFile),
    );

  const writtenQuestions =
    await Promise.all(
      quiz.questions.map(
        async (
          quizQuestion,
          index,
        ) => {
          const question =
            quizQuestion.question;

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

            points:
              quizQuestion.points,

            questionFileUrl:
              await getSignedUrl(
                question.questionFileUrl,
                15,
              ),

            /*
             * This is a staff-only
             * endpoint. Students must
             * never receive this URL.
             */
            markschemeFileUrl:
              question
                .markschemeFileUrl
                ? await getSignedUrl(
                    question
                      .markschemeFileUrl,
                    15,
                  )
                : null,
          };
        },
      ),
    );

  return {
    ...baseResponse,

    paperReview: {
      answerFiles,
      correctedFiles,
      questions:
        writtenQuestions,
    },
  };
}

async function gradePaperSubmission({
  quizId,
  submissionId,
  teacherId,
  graderId,
  grade,
  comments,
  files = [],
}) {
  const quiz =
    await assertQuizOwnership(
      quizId,
      teacherId,
    );

  if (quiz.type !== "PAPER") {
    throw createServiceError(
      400,
      "Only Paper quizzes can be manually graded through this endpoint.",
    );
  }

  const submission =
    await prisma.quizSubmission.findFirst(
      {
        where: {
          id: submissionId,
          quizId,
        },

        include: {
          correctedPaperFiles: {
            select: {
              id: true,
            },
          },
        },
      },
    );

  if (!submission) {
    throw createServiceError(
      404,
      "Paper quiz submission not found.",
    );
  }

  if (!submission.isSubmitted) {
    throw createServiceError(
      409,
      "The student has not submitted this Paper quiz yet.",
    );
  }

  const normalizedGrade =
    normalizeGrade(
      grade,
      quiz.totalPoints,
    );

  const normalizedComments =
    normalizeComments(comments);

  const uploadedFiles =
    Array.isArray(files)
      ? files
      : [];

  const existingCount =
    submission
      .correctedPaperFiles
      .length;

  if (
    existingCount +
      uploadedFiles.length >
    MAX_CORRECTED_FILES
  ) {
    throw createServiceError(
      400,
      `A Paper submission can contain a maximum of ${MAX_CORRECTED_FILES} corrected files.`,
    );
  }

  const uploadedObjects = [];

  try {
    for (
      let index = 0;
      index <
      uploadedFiles.length;
      index += 1
    ) {
      const file =
        uploadedFiles[index];

      const objectKey =
        await uploadBuffer(
          file.buffer,
          file.originalname,
          file.mimetype,
          `quiz-corrections/${quizId}/${submissionId}`,
        );

      uploadedObjects.push({
        objectKey,

        originalName:
          file.originalname,

        contentType:
          file.mimetype,

        size:
          file.size || null,

        order:
          existingCount + index,

        uploadedById:
          graderId,
      });
    }

    await prisma.$transaction(
      async (tx) => {
        if (
          uploadedObjects.length
        ) {
          await tx.correctedPaperQuizFile.createMany(
            {
              data:
                uploadedObjects.map(
                  (file) => ({
                    submissionId,
                    ...file,
                  }),
                ),
            },
          );
        }

        await tx.quizSubmission.update(
          {
            where: {
              id: submissionId,
            },

            data: {
              score:
                normalizedGrade,

              isGraded: true,

              gradedAt:
                new Date(),

              gradedById:
                graderId,

              gradingComments:
                normalizedComments,
            },
          },
        );
      },
    );
  } catch (error) {
    await Promise.allSettled(
      uploadedObjects.map(
        (file) =>
          deleteFile(
            file.objectKey,
          ),
      ),
    );

    throw error;
  }

  return getQuizSubmissionDetail({
    quizId,
    submissionId,
    teacherId,
  });
}

async function deleteCorrectedPaperFile({
  quizId,
  submissionId,
  fileId,
  teacherId,
}) {
  const quiz =
    await assertQuizOwnership(
      quizId,
      teacherId,
    );

  if (quiz.type !== "PAPER") {
    throw createServiceError(
      400,
      "Corrected files belong to Paper quizzes only.",
    );
  }

  const file =
    await prisma.correctedPaperQuizFile.findFirst(
      {
        where: {
          id: fileId,
          submissionId,

          submission: {
            quizId,
          },
        },
      },
    );

  if (!file) {
    throw createServiceError(
      404,
      "Corrected Paper quiz file not found.",
    );
  }

  await prisma.correctedPaperQuizFile.delete(
    {
      where: {
        id: file.id,
      },
    },
  );

  try {
    await deleteFile(
      file.objectKey,
    );
  } catch (error) {
    console.error(
      "Corrected Paper file storage deletion failed:",
      error,
    );
  }

  return {
    id: file.id,
  };
}

module.exports = {
  listQuizSubmissions,
  getQuizSubmissionDetail,
  gradePaperSubmission,
  deleteCorrectedPaperFile,
};