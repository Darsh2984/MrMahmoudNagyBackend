const path = require("path");

const {
  PDFDocument,
  StandardFonts,
  rgb,
} = require("pdf-lib");

const prisma = require("../config/prisma");

const {
  uploadBuffer,
  downloadBuffer,
  deleteFile,
  getSignedUrl,
} = require("./storage.service");

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const PAPER_FOLDER =
  "quiz-papers/generated";

function createServiceError(status, msg, data) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  if (data !== undefined) {
    error.data = data;
  }

  return error;
}

function sanitizeFilename(value) {
  const safeValue = String(
    value || "paper-quiz",
  )
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safeValue || "paper-quiz";
}

function isPdfFile({
  contentType,
  originalName,
  objectKey,
}) {
  if (
    String(contentType || "")
      .toLowerCase()
      .includes("application/pdf")
  ) {
    return true;
  }

  const extension = path
    .extname(
      originalName ||
        objectKey ||
        "",
    )
    .toLowerCase();

  return extension === ".pdf";
}

function getImageType({
  contentType,
  originalName,
  objectKey,
}) {
  const normalizedType = String(
    contentType || "",
  ).toLowerCase();

  if (
    SUPPORTED_IMAGE_TYPES.has(
      normalizedType,
    )
  ) {
    return normalizedType === "image/jpg"
      ? "image/jpeg"
      : normalizedType;
  }

  const extension = path
    .extname(
      originalName ||
        objectKey ||
        "",
    )
    .toLowerCase();

  if (
    extension === ".jpg" ||
    extension === ".jpeg"
  ) {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  return null;
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
      message: "This quiz is closed.",
    };
  }

  if (quiz.status !== "PUBLISHED") {
    return {
      code: "UNAVAILABLE",
      allowed: false,
      message:
        "This quiz is unavailable.",
    };
  }

  return {
    code: "AVAILABLE",
    allowed: true,
    message: "This quiz is available.",
  };
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
                points: true,
                questionFileUrl: true,
              },
            },
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

  if (!quiz.questions.length) {
    throw createServiceError(
      400,
      "This Paper quiz has no questions.",
    );
  }

  const invalidQuestion =
    quiz.questions.find(
      (quizQuestion) =>
        quizQuestion.question?.type !==
        "WRITTEN",
    );

  if (invalidQuestion) {
    throw createServiceError(
      400,
      "Paper quizzes may contain Written questions only.",
    );
  }

  return quiz;
}

async function addCoverPage(
  pdfDocument,
  quiz,
) {
  const page = pdfDocument.addPage([
    595.28,
    841.89,
  ]);

  const regularFont =
    await pdfDocument.embedFont(
      StandardFonts.Helvetica,
    );

  const boldFont =
    await pdfDocument.embedFont(
      StandardFonts.HelveticaBold,
    );

  const width = page.getWidth();
  const height = page.getHeight();

  const title = quiz.title || "Paper Quiz";

  page.drawText("PAPER QUIZ", {
    x: 50,
    y: height - 90,
    size: 14,
    font: boldFont,
    color: rgb(0.04, 0.24, 0.29),
  });

  page.drawText(title, {
    x: 50,
    y: height - 135,
    size: 24,
    font: boldFont,
    color: rgb(0.2, 0.19, 0.18),
    maxWidth: width - 100,
  });

  if (quiz.description) {
    page.drawText(quiz.description, {
      x: 50,
      y: height - 185,
      size: 11,
      font: regularFont,
      color: rgb(0.35, 0.35, 0.35),
      maxWidth: width - 100,
      lineHeight: 16,
    });
  }

  const totalQuestions =
    quiz.questions.length;

  const totalPoints =
    Number(quiz.totalPoints || 0);

  const durationMinutes =
    Number(quiz.durationMinutes || 0);

  const details = [
    `Questions: ${totalQuestions}`,
    `Total marks: ${totalPoints}`,
    `Duration: ${durationMinutes} minutes`,
  ];

  details.forEach((line, index) => {
    page.drawText(line, {
      x: 50,
      y: height - 265 - index * 28,
      size: 12,
      font: regularFont,
      color: rgb(0.2, 0.19, 0.18),
    });
  });

  page.drawText("Student name:", {
    x: 50,
    y: height - 390,
    size: 12,
    font: boldFont,
    color: rgb(0.2, 0.19, 0.18),
  });

  page.drawLine({
    start: {
      x: 150,
      y: height - 393,
    },
    end: {
      x: width - 50,
      y: height - 393,
    },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.6),
  });

  page.drawText("Instructions", {
    x: 50,
    y: height - 455,
    size: 14,
    font: boldFont,
    color: rgb(0.04, 0.24, 0.29),
  });

  const instructions = [
    "1. Answer all questions on paper.",
    "2. Show all working clearly.",
    "3. Upload clear images or PDF files before the deadline.",
    "4. Keep the uploaded pages in the correct order.",
  ];

  instructions.forEach(
    (instruction, index) => {
      page.drawText(instruction, {
        x: 60,
        y:
          height -
          490 -
          index * 28,
        size: 11,
        font: regularFont,
        color: rgb(0.2, 0.19, 0.18),
      });
    },
  );
}

async function appendPdfFile({
  targetDocument,
  sourceBuffer,
}) {
  let sourceDocument;

  try {
    sourceDocument =
      await PDFDocument.load(
        sourceBuffer,
        {
          ignoreEncryption: false,
        },
      );
  } catch {
    throw createServiceError(
      400,
      "One of the question PDF files could not be read.",
    );
  }

  if (sourceDocument.isEncrypted) {
    throw createServiceError(
      400,
      "Encrypted question PDFs are not supported.",
    );
  }

  const sourcePageIndices =
    sourceDocument.getPageIndices();

  if (!sourcePageIndices.length) {
    throw createServiceError(
      400,
      "One of the question PDF files has no pages.",
    );
  }

  const copiedPages =
    await targetDocument.copyPages(
      sourceDocument,
      sourcePageIndices,
    );

  copiedPages.forEach((page) => {
    targetDocument.addPage(page);
  });
}

async function appendImageFile({
  targetDocument,
  sourceBuffer,
  imageType,
}) {
  let embeddedImage;

  try {
    embeddedImage =
      imageType === "image/png"
        ? await targetDocument.embedPng(
            sourceBuffer,
          )
        : await targetDocument.embedJpg(
            sourceBuffer,
          );
  } catch {
    throw createServiceError(
      400,
      "One of the question image files could not be read.",
    );
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 35;

  const availableWidth =
    pageWidth - margin * 2;

  const availableHeight =
    pageHeight - margin * 2;

  const imageDimensions =
    embeddedImage.scale(1);

  const widthScale =
    availableWidth /
    imageDimensions.width;

  const heightScale =
    availableHeight /
    imageDimensions.height;

  const scale = Math.min(
    widthScale,
    heightScale,
    1,
  );

  const imageWidth =
    imageDimensions.width * scale;

  const imageHeight =
    imageDimensions.height * scale;

  const page = targetDocument.addPage([
    pageWidth,
    pageHeight,
  ]);

  page.drawImage(embeddedImage, {
    x: (pageWidth - imageWidth) / 2,
    y: (pageHeight - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight,
  });
}

async function appendQuestionDivider({
  pdfDocument,
  quizQuestion,
  questionNumber,
}) {
  const page = pdfDocument.addPage([
    595.28,
    841.89,
  ]);

  const regularFont =
    await pdfDocument.embedFont(
      StandardFonts.Helvetica,
    );

  const boldFont =
    await pdfDocument.embedFont(
      StandardFonts.HelveticaBold,
    );

  const question =
    quizQuestion.question;

  const pageHeight = page.getHeight();

  page.drawText(
    `Question ${questionNumber}`,
    {
      x: 50,
      y: pageHeight - 90,
      size: 20,
      font: boldFont,
      color: rgb(0.04, 0.24, 0.29),
    },
  );

  page.drawText(
    `${Number(
      quizQuestion.points || 0,
    )} ${
      Number(
        quizQuestion.points || 0,
      ) === 1
        ? "mark"
        : "marks"
    }`,
    {
      x: 50,
      y: pageHeight - 125,
      size: 12,
      font: boldFont,
      color: rgb(0.2, 0.19, 0.18),
    },
  );

  if (question.title) {
    page.drawText(question.title, {
      x: 50,
      y: pageHeight - 165,
      size: 14,
      font: regularFont,
      color: rgb(0.2, 0.19, 0.18),
      maxWidth: page.getWidth() - 100,
      lineHeight: 19,
    });
  }

  if (question.reference) {
    page.drawText(
      `Reference: ${question.reference}`,
      {
        x: 50,
        y: pageHeight - 215,
        size: 10,
        font: regularFont,
        color: rgb(0.45, 0.45, 0.45),
      },
    );
  }
}

async function buildPaperPdf(quiz) {
  const pdfDocument =
    await PDFDocument.create();

  await addCoverPage(
    pdfDocument,
    quiz,
  );

  for (
    let index = 0;
    index < quiz.questions.length;
    index += 1
  ) {
    const quizQuestion =
      quiz.questions[index];

    const question =
      quizQuestion.question;

    if (!question?.questionFileUrl) {
      throw createServiceError(
        400,
        `Question ${index + 1} has no uploaded file.`,
      );
    }

    await appendQuestionDivider({
      pdfDocument,
      quizQuestion,
      questionNumber: index + 1,
    });

    const storedFile =
      await downloadBuffer(
        question.questionFileUrl,
      );

    const pdfFile = isPdfFile({
      contentType:
        storedFile.contentType,
      originalName:
        storedFile.originalName,
      objectKey:
        question.questionFileUrl,
    });

    if (pdfFile) {
      await appendPdfFile({
        targetDocument: pdfDocument,
        sourceBuffer:
          storedFile.buffer,
      });

      continue;
    }

    const imageType = getImageType({
      contentType:
        storedFile.contentType,
      originalName:
        storedFile.originalName,
      objectKey:
        question.questionFileUrl,
    });

    if (!imageType) {
      throw createServiceError(
        400,
        `Question ${
          index + 1
        } uses an unsupported file type.`,
      );
    }

    await appendImageFile({
      targetDocument: pdfDocument,
      sourceBuffer:
        storedFile.buffer,
      imageType,
    });
  }

  const bytes =
    await pdfDocument.save({
      useObjectStreams: false,
    });

  return Buffer.from(bytes);
}

async function ensurePaperAttempt({
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
        expiresAt: quiz.endAt || null,
        isSubmitted: false,
        isAutoSubmitted: false,
        isGraded: false,
      },
    });

  return submission;
}

async function generateStudentPaper({
  quizId,
  studentId,
}) {
  const quiz =
    await getAssignedPaperQuiz({
      quizId,
      studentId,
    });

  const availability =
    getQuizAvailability(quiz);

  let submission =
    await ensurePaperAttempt({
      quiz,
      studentId,
    });

  if (
    submission.isSubmitted &&
    !submission.paperFileKey
  ) {
    throw createServiceError(
      409,
      "This Paper quiz has already been submitted.",
    );
  }

  if (
    !submission.isSubmitted &&
    !availability.allowed
  ) {
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

  if (submission.paperFileKey) {
    const signedUrl =
      await getSignedUrl(
        submission.paperFileKey,
        10,
      );

    return {
      quizId: quiz.id,
      submissionId: submission.id,
      title: quiz.title,
      description: quiz.description,
      totalQuestions:
        quiz.questions.length,
      totalPoints:
        Number(quiz.totalPoints || 0),
      durationMinutes:
        quiz.durationMinutes,
      startAt: quiz.startAt,
      endAt: quiz.endAt,
      paperUrl: signedUrl,
      paperGeneratedAt:
        submission.paperGeneratedAt,
      expiresAt:
        submission.expiresAt,
      submittedAt:
        submission.submittedAt,
      isSubmitted:
        submission.isSubmitted,
      isGraded:
        submission.isGraded,
      score:
        submission.isGraded
          ? Number(submission.score)
          : null,
      serverTime:
        new Date().toISOString(),
    };
  }

  const paperBuffer =
    await buildPaperPdf(quiz);

  const generatedFilename =
    `${sanitizeFilename(
      quiz.title,
    )}-${quiz.id}.pdf`;

  let uploadedObjectKey = null;

  try {
    uploadedObjectKey =
      await uploadBuffer(
        paperBuffer,
        generatedFilename,
        "application/pdf",
        PAPER_FOLDER,
      );

    submission =
      await prisma.quizSubmission.update({
        where: {
          id: submission.id,
        },

        data: {
          paperFileKey:
            uploadedObjectKey,

          paperGeneratedAt:
            new Date(),
        },
      });
  } catch (error) {
    if (uploadedObjectKey) {
      await deleteFile(
        uploadedObjectKey,
      );
    }

    throw error;
  }

  const paperUrl =
    await getSignedUrl(
      submission.paperFileKey,
      10,
    );

  return {
    quizId: quiz.id,
    submissionId: submission.id,
    title: quiz.title,
    description: quiz.description,
    totalQuestions:
      quiz.questions.length,
    totalPoints:
      Number(quiz.totalPoints || 0),
    durationMinutes:
      quiz.durationMinutes,
    startAt: quiz.startAt,
    endAt: quiz.endAt,
    paperUrl,
    paperGeneratedAt:
      submission.paperGeneratedAt,
    expiresAt:
      submission.expiresAt,
    submittedAt:
      submission.submittedAt,
    isSubmitted:
      submission.isSubmitted,
    isGraded:
      submission.isGraded,
    score:
      submission.isGraded
        ? Number(submission.score)
        : null,
    serverTime:
      new Date().toISOString(),
  };
}

async function getStudentPaperStatus({
  quizId,
  studentId,
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
    const availability =
      getQuizAvailability(quiz);

    return {
      quizId: quiz.id,
      title: quiz.title,
      description: quiz.description,
      type: quiz.type,
      status: quiz.status,
      state: availability.code,
      availabilityMessage:
        availability.message,
      canOpen:
        availability.allowed,
      totalQuestions:
        quiz.questions.length,
      totalPoints:
        Number(quiz.totalPoints || 0),
      durationMinutes:
        quiz.durationMinutes,
      startAt: quiz.startAt,
      endAt: quiz.endAt,
      submission: null,
      serverTime:
        new Date().toISOString(),
    };
  }

  return {
    quizId: quiz.id,
    title: quiz.title,
    description: quiz.description,
    type: quiz.type,
    status: quiz.status,
    state: submission.isSubmitted
      ? submission.isGraded
        ? "GRADED"
        : "SUBMITTED"
      : "IN_PROGRESS",
    availabilityMessage:
      getQuizAvailability(quiz).message,
    canOpen:
      !submission.isSubmitted,
    totalQuestions:
      quiz.questions.length,
    totalPoints:
      Number(quiz.totalPoints || 0),
    durationMinutes:
      quiz.durationMinutes,
    startAt: quiz.startAt,
    endAt: quiz.endAt,

    submission: {
        id: submission.id,

        paperGeneratedAt:
            submission.paperGeneratedAt,

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

        isGraded:
            submission.isGraded,

        score:
            submission.isGraded
            ? Number(submission.score)
            : null,

        gradingComments:
            submission.gradingComments,

        uploadedFileCount:
            submission.paperFiles.length,

        files: await Promise.all(
            submission.paperFiles.map(
            async (file) => ({
                id: file.id,
                originalName:
                file.originalName,
                contentType:
                file.contentType,
                size: file.size,
                order: file.order,
                uploadedAt:
                file.uploadedAt,
                fileUrl:
                await getSignedUrl(
                    file.objectKey,
                    10,
                ),
            }),
            ),
        ),
        },

    serverTime:
      new Date().toISOString(),
  };
}

module.exports = {
  generateStudentPaper,
  getStudentPaperStatus,
};