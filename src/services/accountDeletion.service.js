const crypto = require("crypto");

const prisma = require("../config/prisma");
const transporter = require("../config/nodemailer");
const {
  renderEmail,
  renderNotificationEmail,
} = require("../utils/emailTemplate");
const storage = require("./storage.service");

const REQUEST_EXPIRY_HOURS = 48;
const REVIEW_EMAIL = String(
  process.env.ACCOUNT_DELETION_REVIEW_EMAIL ||
    "mostafa_msamir@hotmail.com",
).trim();

function serviceError(status, msg) {
  const error = new Error(msg);
  error.status = status;
  error.msg = msg;
  return error;
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}

function createToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
  };
}

function buildReviewUrl(rawToken) {
  const frontendUrl = String(process.env.FRONTEND_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!frontendUrl) {
    throw serviceError(500, "FRONTEND_URL is not configured.");
  }

  return `${frontendUrl}/account-deletion/${encodeURIComponent(rawToken)}`;
}

function assertValidRole(user) {
  if (!user || !["STUDENT", "ASSISTANT"].includes(user.role)) {
    throw serviceError(
      403,
      "Account deletion requests are available to students and assistants only.",
    );
  }
}

async function requestAccountDeletion(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  assertValidRole(user);

  const { rawToken, tokenHash } = createToken();
  const expiresAt = new Date(
    Date.now() + REQUEST_EXPIRY_HOURS * 60 * 60 * 1000,
  );
  const reviewUrl = buildReviewUrl(rawToken);

  const request = await prisma.$transaction(async (tx) => {
    await tx.accountDeletionRequest.deleteMany({
      where: {
        userId: user.id,
        status: "PENDING",
      },
    });

    return tx.accountDeletionRequest.create({
      data: {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        tokenHash,
        expiresAt,
      },
    });
  });

  try {
    await transporter.sendMail({
      from: {
        name: "Mahmoud Nagy's Team",
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      },
      to: REVIEW_EMAIL,
      subject: `Account deletion request — ${user.name}`,
      text: [
        "A user requested permanent account deletion.",
        "",
        `Name: ${user.name}`,
        `Email: ${user.email}`,
        `Role: ${user.role}`,
        `Requested: ${request.requestedAt.toISOString()}`,
        "",
        `Review and confirm deletion: ${reviewUrl}`,
        "",
        "The link expires in 48 hours. Opening it does not delete the account; deletion requires a second confirmation on the review page.",
      ].join("\n"),
      html: renderEmail({
        preview: `${user.name} requested permanent account deletion.`,
        eyebrow: "Account deletion request",
        title: "Review an account deletion request",
        name: "Mostafa",
        message: `${user.name} (${user.email}) requested permanent deletion of their ${user.role.toLowerCase()} account. Open the secure review page to inspect the request and confirm deletion.`,
        buttonLabel: "Review deletion request",
        buttonUrl: reviewUrl,
        expiresInMinutes: REQUEST_EXPIRY_HOURS * 60,
        securityNote:
          "Opening this link will not delete the account. You must confirm the permanent deletion on the review page. This protects the account from email link scanners and accidental clicks.",
      }),
    });
  } catch (error) {
    await prisma.accountDeletionRequest.delete({
      where: { id: request.id },
    }).catch(() => {});

    console.error(
      "[Account deletion] Review email delivery failed:",
      error?.message || error,
    );

    throw serviceError(
      502,
      "The deletion request email could not be sent. Please try again later.",
    );
  }

  return {
    msg: "Your account deletion request was sent. It will be processed within 48 hours.",
  };
}

async function findRequest(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) {
    throw serviceError(400, "Deletion request token is required.");
  }

  const request = await prisma.accountDeletionRequest.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!request) {
    throw serviceError(404, "This deletion request link is invalid.");
  }

  return request;
}

function presentRequest(request) {
  return {
    id: request.id,
    name: request.userName,
    email: request.userEmail,
    role: request.userRole,
    status: request.status,
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
    expired:
      request.status !== "COMPLETED" &&
      request.expiresAt.getTime() <= Date.now(),
  };
}

async function getAccountDeletionRequest(rawToken) {
  return presentRequest(await findRequest(rawToken));
}

function uniqueObjectKeys(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

async function collectUserObjectKeys(userId) {
  const [
    submissions,
    submissionFiles,
    correctedSubmissionFiles,
    quizSubmissions,
    paperFiles,
    correctedPaperFiles,
    liveAnswers,
    groupMessages,
    supportMessages,
    ticketMessages,
  ] = await Promise.all([
    prisma.submission.findMany({
      where: { studentId: userId },
      select: { fileUrl: true, correctedFileUrl: true },
    }),
    prisma.submissionFile.findMany({
      where: {
        OR: [
          { uploadedById: userId },
          { submission: { studentId: userId } },
        ],
      },
      select: { objectKey: true },
    }),
    prisma.correctedSubmissionFile.findMany({
      where: {
        OR: [
          { uploadedById: userId },
          { submission: { studentId: userId } },
        ],
      },
      select: { objectKey: true },
    }),
    prisma.quizSubmission.findMany({
      where: { studentId: userId },
      select: { paperFileKey: true },
    }),
    prisma.paperQuizSubmissionFile.findMany({
      where: { submission: { studentId: userId } },
      select: { objectKey: true },
    }),
    prisma.correctedPaperQuizFile.findMany({
      where: {
        OR: [
          { uploadedById: userId },
          { submission: { studentId: userId } },
        ],
      },
      select: { objectKey: true },
    }),
    prisma.liveQuestionAnswer.findMany({
      where: { studentId: userId },
      select: { answerImageUrl: true },
    }),
    prisma.groupChatMessage.findMany({
      where: { senderId: userId },
      select: { attachmentUrl: true },
    }),
    prisma.studentSupportChatMessage.findMany({
      where: {
        OR: [
          { senderUserId: userId },
          { chat: { studentId: userId } },
        ],
      },
      select: { attachmentUrl: true },
    }),
    prisma.ticketMessage.findMany({
      where: {
        OR: [
          { senderId: userId },
          { ticket: { createdById: userId } },
        ],
      },
      select: { attachmentUrl: true },
    }),
  ]);

  return uniqueObjectKeys([
    ...submissions.flatMap((item) => [item.fileUrl, item.correctedFileUrl]),
    ...submissionFiles.map((item) => item.objectKey),
    ...correctedSubmissionFiles.map((item) => item.objectKey),
    ...quizSubmissions.map((item) => item.paperFileKey),
    ...paperFiles.map((item) => item.objectKey),
    ...correctedPaperFiles.map((item) => item.objectKey),
    ...liveAnswers.map((item) => item.answerImageUrl),
    ...groupMessages.map((item) => item.attachmentUrl),
    ...supportMessages.map((item) => item.attachmentUrl),
    ...ticketMessages.map((item) => item.attachmentUrl),
  ]);
}

async function transferAssistantOwnedRecords(tx, userId, teacher) {
  const teacherData = { teacherId: teacher.id };

  await Promise.all([
    tx.year.updateMany({ where: { teacherId: userId }, data: teacherData }),
    tx.unit.updateMany({ where: { teacherId: userId }, data: teacherData }),
    tx.material.updateMany({ where: { teacherId: userId }, data: teacherData }),
    tx.video.updateMany({ where: { teacherId: userId }, data: teacherData }),
    tx.question.updateMany({ where: { teacherId: userId }, data: teacherData }),
    tx.quiz.updateMany({ where: { teacherId: userId }, data: teacherData }),
    tx.session.updateMany({ where: { teacherId: userId }, data: teacherData }),
    tx.task.updateMany({ where: { teacherId: userId }, data: teacherData }),
    tx.inClassQuiz.updateMany({ where: { teacherId: userId }, data: teacherData }),
  ]);

  await Promise.all([
    tx.taskAIGradingPack.updateMany({
      where: { uploadedById: userId },
      data: { uploadedById: teacher.id, uploadedByName: teacher.name },
    }),
    tx.taskAIGradingPack.updateMany({
      where: { approvedById: userId },
      data: { approvedById: teacher.id, approvedByName: teacher.name },
    }),
    tx.submissionAICorrection.updateMany({
      where: { generatedById: userId },
      data: { generatedById: teacher.id, generatedByName: teacher.name },
    }),
    tx.submissionAICorrection.updateMany({
      where: { reviewedById: userId },
      data: { reviewedById: teacher.id, reviewedByName: teacher.name },
    }),
    tx.submissionAICorrection.updateMany({
      where: { confirmedById: userId },
      data: { confirmedById: teacher.id, confirmedByName: teacher.name },
    }),
  ]);
}

async function deleteUserData(tx, user, requestId, teacher) {
  const userId = user.id;

  if (user.role === "ASSISTANT") {
    await transferAssistantOwnedRecords(tx, userId, teacher);
  }

  await Promise.all([
    tx.user.updateMany({
      where: { managedByHeadId: userId },
      data: { managedByHeadId: null },
    }),
    tx.ticket.updateMany({
      where: { assignedAssistantId: userId },
      data: { assignedAssistantId: null },
    }),
    tx.ticketCategory.updateMany({
      where: { createdById: userId },
      data: { createdById: null },
    }),
    tx.submission.updateMany({
      where: { gradedById: userId },
      data: { gradedById: null },
    }),
    tx.submission.updateMany({
      where: { hardcopyMarkedById: userId },
      data: { hardcopyMarkedById: null },
    }),
    tx.quizSubmission.updateMany({
      where: { gradedById: userId },
      data: { gradedById: null },
    }),
    tx.liveQuestionAnswer.updateMany({
      where: { gradedById: userId },
      data: { gradedById: null },
    }),
    tx.submissionDelegationHistory.updateMany({
      where: { fromAssistantId: userId },
      data: { fromAssistantId: null },
    }),
    tx.submissionDelegationHistory.updateMany({
      where: { toAssistantId: userId },
      data: { toAssistantId: null },
    }),
  ]);

  await tx.homeworkGradingHistory.deleteMany({ where: { changedById: userId } });
  await tx.submissionDelegationHistory.deleteMany({ where: { changedById: userId } });
  await tx.delegation.deleteMany({
    where: {
      OR: [{ assistantId: userId }, { delegatedById: userId }],
    },
  });

  await tx.correctedPaperQuizFile.deleteMany({ where: { uploadedById: userId } });
  await tx.correctedSubmissionFile.deleteMany({ where: { uploadedById: userId } });
  await tx.submissionFile.deleteMany({ where: { uploadedById: userId } });

  await tx.ticketMessage.deleteMany({ where: { senderId: userId } });
  await tx.ticket.deleteMany({ where: { createdById: userId } });
  await tx.groupChatMessage.deleteMany({ where: { senderId: userId } });
  await tx.studentSupportChatMessage.deleteMany({ where: { senderUserId: userId } });
  await tx.studentSupportChat.deleteMany({ where: { studentId: userId } });

  await Promise.all([
    tx.groupChatReadState.deleteMany({ where: { userId } }),
    tx.studentSupportChatReadState.deleteMany({ where: { userId } }),
    tx.groupMembership.deleteMany({ where: { studentId: userId } }),
    tx.assistantGroupAssignment.deleteMany({ where: { assistantId: userId } }),
    tx.notification.deleteMany({ where: { userId } }),
    tx.pushToken.deleteMany({ where: { userId } }),
    tx.studentActivityLog.deleteMany({ where: { userId } }),
    tx.sessionAttendance.deleteMany({ where: { studentId: userId } }),
    tx.liveQuestionAnswer.deleteMany({ where: { studentId: userId } }),
    tx.quizSubmission.deleteMany({ where: { studentId: userId } }),
    tx.submission.deleteMany({ where: { studentId: userId } }),
  ]);

  if (user.role === "STUDENT") {
    await tx.$executeRaw`
      UPDATE "InClassQuiz"
      SET "studentGrades" = COALESCE(
        (
          SELECT jsonb_agg(entry)
          FROM jsonb_array_elements("studentGrades"::jsonb) AS entry
          WHERE entry->>'studentId' <> ${userId}
        ),
        '[]'::jsonb
      )
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements("studentGrades"::jsonb) AS entry
        WHERE entry->>'studentId' = ${userId}
      )
    `;
  }

  await tx.user.delete({ where: { id: userId } });

  await tx.accountDeletionRequest.update({
    where: { id: requestId },
    data: {
      userId: null,
      userName: "Deleted user",
      userEmail: "deleted",
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
}

async function confirmAccountDeletion(rawToken) {
  const request = await findRequest(rawToken);

  if (request.status === "COMPLETED") {
    return { msg: "This account has already been deleted." };
  }

  if (request.expiresAt.getTime() <= Date.now()) {
    throw serviceError(410, "This deletion request link has expired.");
  }

  const user = await prisma.user.findUnique({
    where: { id: request.userId || "" },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    throw serviceError(404, "The requested account no longer exists.");
  }

  assertValidRole(user);

  const teacher =
    user.role === "ASSISTANT"
      ? await prisma.user.findFirst({
          where: { role: "TEACHER" },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        })
      : null;

  if (user.role === "ASSISTANT" && !teacher) {
    throw serviceError(
      409,
      "A main teacher account is required before this assistant can be deleted.",
    );
  }

  const objectKeys = await collectUserObjectKeys(user.id);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.accountDeletionRequest.updateMany({
      where: {
        id: request.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: { status: "PROCESSING" },
    });

    if (claimed.count !== 1) {
      throw serviceError(409, "This deletion request is already being processed.");
    }

    await deleteUserData(tx, user, request.id, teacher);
  });

  await Promise.allSettled(
    objectKeys.map((objectKey) => storage.deleteFile(objectKey)),
  );

  try {
    await transporter.sendMail({
      from: {
        name: "Mahmoud Nagy's Team",
        address: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      },
      to: user.email,
      subject: "Your Mahmoud Nagy Platform account was deleted",
      text: [
        `Hello ${user.name},`,
        "",
        "Your Mahmoud Nagy Platform account and associated personal data have been permanently deleted.",
        "",
        "You can no longer sign in using this account.",
      ].join("\n"),
      html: renderNotificationEmail({
        preview: "Your account deletion request has been completed.",
        eyebrow: "Account deletion complete",
        title: "Your account was deleted",
        name: user.name,
        message:
          "Your Mahmoud Nagy Platform account and associated personal data have been permanently deleted. You can no longer sign in using this account.",
        note:
          "This message confirms that the account deletion request has been completed.",
      }),
    });
  } catch (error) {
    console.error(
      "[Account deletion] Completion email delivery failed:",
      error?.message || error,
    );
  }

  return {
    msg: `${user.name}'s account and personal data were permanently deleted.`,
  };
}

module.exports = {
  requestAccountDeletion,
  getAccountDeletionRequest,
  confirmAccountDeletion,
};
