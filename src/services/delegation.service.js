const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");

/**
 * Teacher/Head delegates a submitted homework paper to a specific assistant for grading.
 * This ONLY tracks who-was-assigned-what-and-when — it does not compute pay/salary in any
 * way. Mr. Nagy uses the counts this produces (via listDelegationsForAssistant) to work out
 * compensation himself, entirely outside this system.
 */
async function delegateSubmission({
  submissionId,
  assistantId,
  delegatedById,
}) {
  const submission = await prisma.submission.findUnique({
    where: {
      id: submissionId,
    },
    include: {
      task: {
        include: {
          groups: {
            select: {
              groupId: true,
            },
          },
        },
      },
      delegation: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!submission) {
    throw {
      status: 404,
      msg: "Submission not found",
    };
  }

  if (submission.grade !== null) {
    throw {
      status: 400,
      msg: "This submission has already been graded",
    };
  }

  if (submission.delegation) {
    throw {
      status: 400,
      msg: "This submission is already delegated",
    };
  }

  const assistant = await prisma.user.findUnique({
    where: {
      id: assistantId,
    },
    select: {
      id: true,
      role: true,
      isHeadAssistant: true,
      permissions: true,
    },
  });

  if (
    !assistant ||
    assistant.role !== "ASSISTANT"
  ) {
    throw {
      status: 400,
      msg: "assistantId must reference an ASSISTANT",
    };
  }

  const canGradeHomework =
    assistant.isHeadAssistant === true ||
    assistant.permissions?.canGradeHomework === true;

  if (!canGradeHomework) {
    throw {
      status: 400,
      msg:
        "This assistant does not have homework grading permission",
    };
  }

  const taskGroupIds = submission.task.groups.map(
    (taskGroup) => taskGroup.groupId,
  );

  const assignmentCount =
    await prisma.assistantGroupAssignment.count({
      where: {
        assistantId,
        groupId: {
          in: taskGroupIds,
        },
      },
    });

  if (assignmentCount === 0) {
    throw {
      status: 400,
      msg:
        "This assistant is not assigned to the submission's group",
    };
  }

  return prisma.delegation.create({
    data: {
      submissionId,
      assistantId,
      delegatedById,
    },
    include: {
      assistant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/** Assistant grades a submission that was delegated to them. */
async function gradeDelegatedSubmission({
  delegationId,
  grade,
  comments,
  correctedFile,
  gradedBy,
}) {
  const delegation = await prisma.delegation.findUnique({
    where: {
      id: delegationId,
    },
    include: {
      submission: {
        include: {
          task: {
            select: {
              id: true,
              gradeOutOf: true,
            },
          },
        },
      },
    },
  });

  if (!delegation) {
    throw {
      status: 404,
      msg: "Delegation not found",
    };
  }

  if (!gradedBy) {
    throw {
      status: 401,
      msg: "Unauthorized",
    };
  }

  const isTeacher = gradedBy.role === "TEACHER";
  const isHeadAssistant =
    gradedBy.role === "ASSISTANT" &&
    gradedBy.isHeadAssistant === true;

  if (
    !isTeacher &&
    !isHeadAssistant &&
    delegation.assistantId !== gradedBy.id
  ) {
    throw {
      status: 403,
      msg:
        "This submission was delegated to another assistant",
    };
  }

  if (delegation.completedAt) {
    throw {
      status: 400,
      msg:
        "This delegated submission has already been graded",
    };
  }

  const numericGrade = Number(grade);
  const maximumGrade = Number(
    delegation.submission.task.gradeOutOf,
  );

  if (!Number.isFinite(numericGrade)) {
    throw {
      status: 400,
      msg: "Grade must be a valid number",
    };
  }

  if (
    numericGrade < 0 ||
    numericGrade > maximumGrade
  ) {
    throw {
      status: 400,
      msg: `Grade must be between 0 and ${maximumGrade}`,
    };
  }

  let correctedFileUrl =
    delegation.submission.correctedFileUrl;

  if (correctedFile) {
    correctedFileUrl = await storage.uploadBuffer(
      correctedFile.buffer,
      correctedFile.originalname,
      correctedFile.mimetype,
      "corrected",
    );
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const gradedSubmission =
        await tx.submission.update({
          where: {
            id: delegation.submissionId,
          },
          data: {
            grade: numericGrade,
            comments,
            correctedFileUrl,
            gradedAt: new Date(),
          },
        });

      const completedDelegation =
        await tx.delegation.update({
          where: {
            id: delegationId,
          },
          data: {
            completedAt: new Date(),
          },
          include: {
            assistant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

      return {
        submission: gradedSubmission,
        delegation: completedDelegation,
      };
    },
  );

  notify({
    userId: delegation.submission.studentId,
    type: "GRADE_POSTED",
    title: "Your homework was graded",
    body: `You scored ${numericGrade}/${maximumGrade}`,
    link: `/my-tasks/${delegation.submission.task.id}`,
  }).catch((err) =>
    console.error("notify() failed:", err.message),
  );

  return result;
}

/**
 * Counts of delegated papers per assistant within a date range — for Mr. Nagy to use
 * however he wants externally (e.g. as a basis for pay). We only ever return counts and
 * timestamps here, never any monetary figure.
 */
async function getDelegationCounts({ assistantId, from, to }) {
  const where = {
    ...(assistantId ? { assistantId } : {}),
    ...(from || to
      ? { delegatedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };

  const delegations = await prisma.delegation.findMany({
    where,
    include: { assistant: { select: { id: true, name: true } } },
    orderBy: { delegatedAt: "asc" },
  });

  // Group by assistant for a simple per-assistant total, plus how many are completed vs pending.
  const byAssistant = {};
  for (const d of delegations) {
    const key = d.assistantId;
    if (!byAssistant[key]) {
      byAssistant[key] = { assistantId: key, assistantName: d.assistant.name, totalDelegated: 0, completed: 0, pending: 0 };
    }
    byAssistant[key].totalDelegated += 1;
    if (d.completedAt) byAssistant[key].completed += 1;
    else byAssistant[key].pending += 1;
  }

  return Object.values(byAssistant);
}

module.exports = { delegateSubmission, gradeDelegatedSubmission, getDelegationCounts };
