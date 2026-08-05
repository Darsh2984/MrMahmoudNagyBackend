const prisma = require("../config/prisma");

const {
  uploadBuffer,
  deleteFile,
  getSignedUrl,
} = require("./storage.service");

const MAX_FILES = 10;

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

function getQuizAvailability(
  quiz,
  now = new Date(),
) {
  if (quiz.status === "DRAFT") {
    return {
      code: "UNAVAILABLE",
      allowed: false,
      message:
        "This quiz has not been published.",
    };
  }

  if (
    quiz.startAt &&
    now < new Date(quiz.startAt)
  ) {
    return {
      code: "UPCOMING",
      allowed: false,
      message:
        "This quiz has not started yet.",
    };
  }

  if (
    quiz.status === "CLOSED" ||
    (quiz.endAt &&
      now >= new Date(quiz.endAt))
  ) {
    return {
      code: "CLOSED",
      allowed: false,
      message:
        "This Paper quiz is closed.",
    };
  }

  if (quiz.status !== "PUBLISHED") {
    return {
      code: "UNAVAILABLE",
      allowed: false,
      message:
        "This Paper quiz is unavailable.",
    };
  }

  return {
    code: "AVAILABLE",
    allowed: true,
    message:
      "This Paper quiz is available.",
  };
}

async function getStudentGroupIds(
  studentId,
) {
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
    (membership) => membership.groupId,
  );
}

async function getAssignedPaperQuiz({
  quizId,
  studentId,
}) {
  const groupIds =
    await getStudentGroupIds(studentId);

  if (!groupIds.length) {
    throw createServiceError(
      403,
      "You are not currently assigned to a Group.",
    );
  }

  const quiz =
    await prisma.quiz.findFirst({
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
        _count: {
          select: {
            questions: true,
          },
        },
      },
    });

  if (!quiz) {
    throw createServiceError(
      404,
      "Quiz not found or not assigned to your Group.",
    );
  }

  if (quiz.type !== "PAPER") {
    throw createServiceError(
      400,
      "This endpoint supports Paper quizzes only.",
    );
  }

  return quiz;
}

function hasSubmissionExpired(
  submission,
  quiz,
  now = new Date(),
) {
  if (
    submission.expiresAt &&
    now >=
      new Date(submission.expiresAt)
  ) {
    return true;
  }

  if (
    quiz.endAt &&
    now >= new Date(quiz.endAt)
  ) {
    return true;
  }

  return false;
}

async function getOrCreateSubmission({
  quiz,
  studentId,
}) {
  let submission =
    await prisma.quizSubmission.findUnique({
      where: {
        quizId_studentId: {
          quizId: quiz.id,
          studentId,
        },
      },

      include: {
        paperFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  if (submission) {
    return submission;
  }

  const availability =
    getQuizAvailability(quiz);

  if (!availability.allowed) {
    throw createServiceError(
      403,
      availability.message,
      {
        state: availability.code,
        startAt: quiz.startAt,
        endAt: quiz.endAt,
      },
    );
  }

  submission =
    await prisma.quizSubmission.create({
      data: {
        quizId: quiz.id,
        studentId,
        answers: [],
        score: 0,

        startedAt: new Date(),

        expiresAt:
          quiz.endAt || null,

        isSubmitted: false,
        isAutoSubmitted: false,
        isGraded: false,
      },

      include: {
        paperFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  return submission;
}

async function automaticallySubmitExpiredPaper({
  quiz,
  submission,
}) {
  if (
    submission.isSubmitted ||
    !hasSubmissionExpired(
      submission,
      quiz,
    )
  ) {
    return submission;
  }

  return prisma.quizSubmission.update({
    where: {
      id: submission.id,
    },

    data: {
      isSubmitted: true,
      isAutoSubmitted: true,
      submittedAt: new Date(),
    },

    include: {
      paperFiles: {
        orderBy: {
          order: "asc",
        },
      },
    },
  });
}

async function ensureSubmissionEditable({
  quiz,
  submission,
}) {
  if (submission.isSubmitted) {
    throw createServiceError(
      409,
      submission.isAutoSubmitted
        ? "This Paper quiz was automatically submitted."
        : "This Paper quiz has already been submitted.",
    );
  }

  if (
    hasSubmissionExpired(
      submission,
      quiz,
    )
  ) {
    const finalized =
      await automaticallySubmitExpiredPaper({
        quiz,
        submission,
      });

    throw createServiceError(
      409,
      "The Paper quiz deadline has passed and the current uploaded files were automatically submitted.",
      {
        submission: finalized,
      },
    );
  }

  const availability =
    getQuizAvailability(quiz);

  if (!availability.allowed) {
    throw createServiceError(
      403,
      availability.message,
      {
        state: availability.code,
        startAt: quiz.startAt,
        endAt: quiz.endAt,
      },
    );
  }
}

async function mapPaperFile(
  file,
) {
  return {
    id: file.id,
    originalName: file.originalName,
    contentType: file.contentType,
    size: file.size,
    order: file.order,
    uploadedAt: file.uploadedAt,

    fileUrl: await getSignedUrl(
      file.objectKey,
      10,
    ),
  };
}

async function mapSubmission({
  quiz,
  submission,
}) {
  const files = await Promise.all(
    (submission.paperFiles || []).map(
      mapPaperFile,
    ),
  );

  return {
    id: submission.id,
    quizId: submission.quizId,
    studentId: submission.studentId,

    title: quiz.title,

    totalQuestions:
      quiz._count?.questions ?? null,

    totalPoints:
      Number(quiz.totalPoints || 0),

    startedAt: submission.startedAt,
    expiresAt: submission.expiresAt,
    submittedAt: submission.submittedAt,

    isSubmitted:
      submission.isSubmitted,

    isAutoSubmitted:
      submission.isAutoSubmitted,

    isGraded:
      submission.isGraded,

    score:
      submission.isGraded
        ? Number(submission.score)
        : null,

    gradingComments:
      submission.gradingComments,

    files,

    serverTime:
      new Date().toISOString(),
  };
}

async function uploadPaperFiles({
  quizId,
  studentId,
  files,
}) {
  if (
    !Array.isArray(files) ||
    !files.length
  ) {
    throw createServiceError(
      400,
      "Select at least one PDF or image file.",
    );
  }

  const quiz =
    await getAssignedPaperQuiz({
      quizId,
      studentId,
    });

  let submission =
    await getOrCreateSubmission({
      quiz,
      studentId,
    });

  await ensureSubmissionEditable({
    quiz,
    submission,
  });

  const existingFileCount =
    submission.paperFiles.length;

  if (
    existingFileCount + files.length >
    MAX_FILES
  ) {
    throw createServiceError(
      400,
      `A Paper quiz submission may contain a maximum of ${MAX_FILES} files.`,
      {
        existingFileCount,
        selectedFileCount:
          files.length,
      },
    );
  }

  const highestExistingOrder =
    submission.paperFiles.reduce(
      (highest, file) =>
        Math.max(
          highest,
          Number(file.order || 0),
        ),
      -1,
    );

  const uploadedObjects = [];

  try {
    for (
      let index = 0;
      index < files.length;
      index += 1
    ) {
      const file = files[index];

      const objectKey =
        await uploadBuffer(
          file.buffer,
          file.originalname ||
            `paper-answer-${index + 1}`,
          file.mimetype,
          `quiz-submissions/paper/${quiz.id}/${studentId}`,
        );

      uploadedObjects.push({
        objectKey,

        originalName:
          file.originalname ||
          `paper-answer-${index + 1}`,

        contentType:
          file.mimetype ||
          "application/octet-stream",

        size:
          Number.isFinite(
            Number(file.size),
          )
            ? Number(file.size)
            : file.buffer.length,

        order:
          highestExistingOrder +
          index +
          1,
      });
    }

    await prisma.$transaction(
      uploadedObjects.map(
        (uploadedFile) =>
          prisma.paperQuizSubmissionFile.create({
            data: {
              submissionId:
                submission.id,

              objectKey:
                uploadedFile.objectKey,

              originalName:
                uploadedFile.originalName,

              contentType:
                uploadedFile.contentType,

              size:
                uploadedFile.size,

              order:
                uploadedFile.order,
            },
          }),
      ),
    );
  } catch (error) {
    await Promise.all(
      uploadedObjects.map(
        (uploadedFile) =>
          deleteFile(
            uploadedFile.objectKey,
          ),
      ),
    );

    throw error;
  }

  submission =
    await prisma.quizSubmission.findUnique({
      where: {
        id: submission.id,
      },

      include: {
        paperFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  return {
    msg:
      files.length === 1
        ? "Paper quiz answer file uploaded."
        : "Paper quiz answer files uploaded.",

    submission:
      await mapSubmission({
        quiz,
        submission,
      }),
  };
}

async function deletePaperFile({
  quizId,
  studentId,
  fileId,
}) {
  const quiz =
    await getAssignedPaperQuiz({
      quizId,
      studentId,
    });

  const submission =
    await prisma.quizSubmission.findUnique({
      where: {
        quizId_studentId: {
          quizId,
          studentId,
        },
      },

      include: {
        paperFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Paper quiz submission not found.",
    );
  }

  await ensureSubmissionEditable({
    quiz,
    submission,
  });

  const file =
    submission.paperFiles.find(
      (item) => item.id === fileId,
    );

  if (!file) {
    throw createServiceError(
      404,
      "Paper quiz answer file not found.",
    );
  }

  await prisma.paperQuizSubmissionFile.delete({
    where: {
      id: file.id,
    },
  });

  await deleteFile(file.objectKey);

  const remainingFiles =
    await prisma.paperQuizSubmissionFile.findMany({
      where: {
        submissionId:
          submission.id,
      },

      orderBy: {
        order: "asc",
      },
    });

  if (remainingFiles.length) {
    await prisma.$transaction(
      remainingFiles.map(
        (remainingFile, index) =>
          prisma.paperQuizSubmissionFile.update({
            where: {
              id: remainingFile.id,
            },

            data: {
              order: index,
            },
          }),
      ),
    );
  }

  const updatedSubmission =
    await prisma.quizSubmission.findUnique({
      where: {
        id: submission.id,
      },

      include: {
        paperFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  return {
    msg:
      "Paper quiz answer file deleted.",

    submission:
      await mapSubmission({
        quiz,
        submission:
          updatedSubmission,
      }),
  };
}

async function submitPaperQuiz({
  quizId,
  studentId,
}) {
  const quiz =
    await getAssignedPaperQuiz({
      quizId,
      studentId,
    });

  let submission =
    await prisma.quizSubmission.findUnique({
      where: {
        quizId_studentId: {
          quizId,
          studentId,
        },
      },

      include: {
        paperFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Open the Paper quiz and upload your answer files before submitting.",
    );
  }

  if (submission.isSubmitted) {
    return {
      msg: submission.isAutoSubmitted
        ? "Paper quiz was automatically submitted."
        : "Paper quiz was already submitted.",

      submission:
        await mapSubmission({
          quiz,
          submission,
        }),
    };
  }

  const expired =
    hasSubmissionExpired(
      submission,
      quiz,
    );

  if (
    !submission.paperFiles.length
  ) {
    if (expired) {
      submission =
        await automaticallySubmitExpiredPaper({
          quiz,
          submission,
        });
    }

    throw createServiceError(
      400,
      expired
        ? "The Paper quiz deadline has passed and no answer files were uploaded."
        : "Upload at least one answer file before submitting the Paper quiz.",
      expired
        ? {
            submission,
          }
        : undefined,
    );
  }

  submission =
    await prisma.quizSubmission.update({
      where: {
        id: submission.id,
      },

      data: {
        isSubmitted: true,

        isAutoSubmitted:
          Boolean(expired),

        submittedAt: new Date(),
      },

      include: {
        paperFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  return {
    msg: submission.isAutoSubmitted
      ? "Paper quiz automatically submitted because the deadline passed."
      : "Paper quiz submitted.",

    submission:
      await mapSubmission({
        quiz,
        submission,
      }),
  };
}

module.exports = {
  uploadPaperFiles,
  deletePaperFile,
  submitPaperQuiz,
};