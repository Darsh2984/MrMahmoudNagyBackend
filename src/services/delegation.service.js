const prisma = require("../config/prisma");

const {
  notify,
} = require("./notification.service");

const MAX_BULK_SUBMISSIONS = 100;
const BULK_DELEGATION_CONCURRENCY = 5;

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

function normalizeReason(reason) {
  if (typeof reason !== "string") {
    return null;
  }

  const normalized =
    reason.trim();

  return normalized || null;
}

async function getSubmissionForDelegation(
  submissionId,
) {
  const submission =
    await prisma.submission.findUnique({
      where: {
        id: submissionId,
      },

      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },

        task: {
          include: {
            groups: {
              select: {
                groupId: true,

                group: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },

        delegation: {
          include: {
            assistant: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },

            delegatedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Submission not found.",
    );
  }

  return submission;
}

async function getEligibleAssistant({
  assistantId,
  taskGroupIds,
}) {
  if (!assistantId) {
    throw createServiceError(
      400,
      "assistantId is required.",
    );
  }

  const assistant =
    await prisma.user.findUnique({
      where: {
        id: assistantId,
      },

      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isHeadAssistant: true,
        permissions: true,
      },
    });

  if (
    !assistant ||
    assistant.role !== "ASSISTANT"
  ) {
    throw createServiceError(
      400,
      "assistantId must reference an assistant.",
    );
  }

  const canGradeHomework =
    assistant.isHeadAssistant === true ||
    assistant.permissions
      ?.canGradeHomework === true;

  if (!canGradeHomework) {
    throw createServiceError(
      400,
      "This assistant does not have homework grading permission.",
    );
  }

  if (
    !Array.isArray(taskGroupIds) ||
    taskGroupIds.length === 0
  ) {
    throw createServiceError(
      400,
      "The task is not assigned to any groups.",
    );
  }

  const assignmentCount =
    await prisma
      .assistantGroupAssignment
      .count({
        where: {
          assistantId,

          groupId: {
            in: taskGroupIds,
          },
        },
      });

  if (assignmentCount === 0) {
    throw createServiceError(
      400,
      "This assistant is not assigned to any group associated with this submission.",
    );
  }

  return assistant;
}

async function notifyAssistantOfDelegation({
  assistantId,
  submission,
  title,
  body,
}) {
  try {
    await notify({
      userId: assistantId,

      type:
        "HOMEWORK_DELEGATED",

      title,

      body,

      link:
        `/tasks/${submission.taskId}`,
    });
  } catch (error) {
    console.error(
      "Delegation notification failed:",
      error.message,
    );
  }
}

/**
 * Teacher or Head Assistant assigns one
 * ungraded submission to an eligible assistant.
 */
async function delegateSubmission({
  submissionId,
  assistantId,
  delegatedById,
  reason,
}) {
  if (!delegatedById) {
    throw createServiceError(
      401,
      "Unauthorized.",
    );
  }

  const submission =
    await getSubmissionForDelegation(
      submissionId,
    );

  if (submission.grade !== null) {
    throw createServiceError(
      409,
      "This submission has already been graded.",
    );
  }

  if (submission.delegation) {
    throw createServiceError(
      409,
      "This submission is already delegated.",
      {
        delegationId:
          submission.delegation.id,

        assistantId:
          submission.delegation
            .assistantId,

        assistantName:
          submission.delegation
            .assistant?.name,
      },
    );
  }

  const taskGroupIds =
    submission.task.groups.map(
      (taskGroup) =>
        taskGroup.groupId,
    );

  const assistant =
    await getEligibleAssistant({
      assistantId,
      taskGroupIds,
    });

  const normalizedReason =
    normalizeReason(reason);

  const delegation =
    await prisma.$transaction(
      async (tx) => {
        const created =
          await tx.delegation.create({
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
                  email: true,
                },
              },

              delegatedBy: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

        await tx
          .submissionDelegationHistory
          .create({
            data: {
              submissionId,
              delegationId:
                created.id,

              action:
                "ASSIGNED",

              fromAssistantId:
                null,

              toAssistantId:
                assistantId,

              changedById:
                delegatedById,

              reason:
                normalizedReason,
            },
          });

        return created;
      },
    );

  await notifyAssistantOfDelegation({
    assistantId,

    submission,

    title:
      "Homework assigned for grading",

    body:
      `${submission.student?.name || "A student"} submitted ${submission.task?.title || "homework"} for you to grade.`,
  });

  return delegation;
}

/**
 * Reassigns a pending delegation to another
 * eligible assistant while preserving history.
 */
async function reassignDelegation({
  delegationId,
  assistantId,
  changedById,
  reason,
}) {
  if (!changedById) {
    throw createServiceError(
      401,
      "Unauthorized.",
    );
  }

  if (!delegationId) {
    throw createServiceError(
      400,
      "delegationId is required.",
    );
  }

  const delegation =
    await prisma.delegation.findUnique({
      where: {
        id: delegationId,
      },

      include: {
        assistant: {
          select: {
            id: true,
            name: true,
          },
        },

        submission: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },

            task: {
              include: {
                groups: {
                  select: {
                    groupId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

  if (!delegation) {
    throw createServiceError(
      404,
      "Delegation not found.",
    );
  }

  if (
    delegation.submission.grade !==
    null
  ) {
    throw createServiceError(
      409,
      "A graded submission cannot be reassigned.",
    );
  }

  if (delegation.completedAt) {
    throw createServiceError(
      409,
      "A completed delegation cannot be reassigned.",
    );
  }

  if (
    String(delegation.assistantId) ===
    String(assistantId)
  ) {
    throw createServiceError(
      400,
      "The submission is already assigned to this assistant.",
    );
  }

  const taskGroupIds =
    delegation.submission.task.groups.map(
      (taskGroup) =>
        taskGroup.groupId,
    );

  const newAssistant =
    await getEligibleAssistant({
      assistantId,
      taskGroupIds,
    });

  const previousAssistantId =
    delegation.assistantId;

  const normalizedReason =
    normalizeReason(reason);

  const updatedDelegation =
    await prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.delegation.update({
            where: {
              id: delegationId,
            },

            data: {
              assistantId,

              delegatedById:
                changedById,

              delegatedAt:
                new Date(),

              completedAt:
                null,
            },

            include: {
              assistant: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },

              delegatedBy: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

        await tx
          .submissionDelegationHistory
          .create({
            data: {
              submissionId:
                delegation.submissionId,

              delegationId,

              action:
                "REASSIGNED",

              fromAssistantId:
                previousAssistantId,

              toAssistantId:
                assistantId,

              changedById,

              reason:
                normalizedReason ||
                `Reassigned from ${delegation.assistant?.name || "previous assistant"} to ${newAssistant.name}.`,
            },
          });

        return updated;
      },
    );

  await notifyAssistantOfDelegation({
    assistantId,

    submission:
      delegation.submission,

    title:
      "Homework reassigned to you",

    body:
      `${delegation.submission.student?.name || "A student"}'s ${delegation.submission.task?.title || "homework"} was reassigned to you for grading.`,
  });

  return updatedDelegation;
}

/**
 * Removes a pending delegation and returns the
 * submission to the unassigned grading queue.
 */
async function removeDelegation({
  delegationId,
  changedById,
  reason,
}) {
  if (!changedById) {
    throw createServiceError(
      401,
      "Unauthorized.",
    );
  }

  const delegation =
    await prisma.delegation.findUnique({
      where: {
        id: delegationId,
      },

      include: {
        assistant: {
          select: {
            id: true,
            name: true,
          },
        },

        submission: {
          select: {
            id: true,
            grade: true,
            studentId: true,
            taskId: true,
          },
        },
      },
    });

  if (!delegation) {
    throw createServiceError(
      404,
      "Delegation not found.",
    );
  }

  if (
    delegation.submission.grade !==
    null
  ) {
    throw createServiceError(
      409,
      "A graded submission cannot have its delegation removed.",
    );
  }

  if (delegation.completedAt) {
    throw createServiceError(
      409,
      "A completed delegation cannot be removed.",
    );
  }

  const normalizedReason =
    normalizeReason(reason);

  await prisma.$transaction(
    async (tx) => {
      await tx
        .submissionDelegationHistory
        .create({
          data: {
            submissionId:
              delegation.submissionId,

            delegationId:
              delegation.id,

            action:
              "REMOVED",

            fromAssistantId:
              delegation.assistantId,

            toAssistantId:
              null,

            changedById,

            reason:
              normalizedReason ||
              "Delegation removed.",
          },
        });

      await tx.delegation.delete({
        where: {
          id: delegation.id,
        },
      });
    },
  );

  return {
    removedDelegationId:
      delegation.id,

    submissionId:
      delegation.submissionId,

    previousAssistant: {
      id:
        delegation.assistantId,

      name:
        delegation.assistant?.name ||
        null,
    },
  };
}

/**
 * Delegates multiple ungraded submissions.
 *
 * Individual failures do not cancel successful
 * delegations. The response reports both.
 */
async function bulkDelegateSubmissions({
  submissionIds,
  assistantId,
  delegatedById,
  reason,
}) {
  if (
    !Array.isArray(submissionIds)
  ) {
    throw createServiceError(
      400,
      "submissionIds must be an array.",
    );
  }

  const uniqueSubmissionIds = [
    ...new Set(
      submissionIds
        .filter(Boolean)
        .map(String),
    ),
  ];

  if (!uniqueSubmissionIds.length) {
    throw createServiceError(
      400,
      "Select at least one submission.",
    );
  }

  if (
    uniqueSubmissionIds.length >
    MAX_BULK_SUBMISSIONS
  ) {
    throw createServiceError(
      400,
      `You may delegate a maximum of ${MAX_BULK_SUBMISSIONS} submissions at once.`,
    );
  }

  const successful = [];
  const failed = [];

  for (
    let index = 0;
    index < uniqueSubmissionIds.length;
    index += BULK_DELEGATION_CONCURRENCY
  ) {
    const batch = uniqueSubmissionIds.slice(
      index,
      index + BULK_DELEGATION_CONCURRENCY,
    );

    const results = await Promise.all(
      batch.map(async (submissionId) => {
        try {
          const delegation =
            await delegateSubmission({
              submissionId,
              assistantId,
              delegatedById,
              reason,
            });

          return {
            ok: true,
            submissionId,
            delegation,
          };
        } catch (error) {
          return {
            ok: false,
            submissionId,
            error,
          };
        }
      }),
    );

    for (const result of results) {
      if (result.ok) {
        successful.push({
          submissionId:
            result.submissionId,

          delegationId:
            result.delegation.id,

          assistantId:
            result.delegation.assistantId,

          assistantName:
            result.delegation.assistant
              ?.name ||
            null,
        });

        continue;
      }

      failed.push({
        submissionId:
          result.submissionId,

        status:
          result.error?.status || 500,

        message:
          result.error?.msg ||
          result.error?.message ||
          "Delegation failed.",
      });
    }
  }

  return {
    requested:
      uniqueSubmissionIds.length,

    delegated:
      successful.length,

    failed:
      failed.length,

    successful,
    failures: failed,
  };
}

/**
 * Returns the complete delegation timeline for
 * one homework submission.
 */
async function getSubmissionDelegationHistory({
  submissionId,
}) {
  const submission =
    await prisma.submission.findUnique({
      where: {
        id: submissionId,
      },

      select: {
        id: true,

        student: {
          select: {
            id: true,
            name: true,
          },
        },

        task: {
          select: {
            id: true,
            title: true,
          },
        },

        delegation: {
          include: {
            assistant: {
              select: {
                id: true,
                name: true,
              },
            },

            delegatedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Submission not found.",
    );
  }

  const history =
    await prisma
      .submissionDelegationHistory
      .findMany({
        where: {
          submissionId,
        },

        include: {
          fromAssistant: {
            select: {
              id: true,
              name: true,
            },
          },

          toAssistant: {
            select: {
              id: true,
              name: true,
            },
          },

          changedBy: {
            select: {
              id: true,
              name: true,
              role: true,
              isHeadAssistant: true,
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });

  return {
    submission: {
      id:
        submission.id,

      student:
        submission.student,

      task:
        submission.task,

      currentDelegation:
        submission.delegation ||
        null,
    },

    history,
  };
}

/**
 * Counts delegated papers per assistant over an
 * optional date range.
 */
async function getDelegationCounts({
  assistantId,
  from,
  to,
}) {
  const delegatedAt = {};

  if (from) {
    const parsedFrom =
      new Date(from);

    if (
      Number.isNaN(
        parsedFrom.getTime(),
      )
    ) {
      throw createServiceError(
        400,
        "Invalid from date.",
      );
    }

    delegatedAt.gte =
      parsedFrom;
  }

  if (to) {
    const parsedTo =
      new Date(to);

    if (
      Number.isNaN(
        parsedTo.getTime(),
      )
    ) {
      throw createServiceError(
        400,
        "Invalid to date.",
      );
    }

    delegatedAt.lte =
      parsedTo;
  }

  const delegations =
    await prisma.delegation.findMany({
      where: {
        ...(assistantId
          ? {
              assistantId,
            }
          : {}),

        ...(Object.keys(delegatedAt)
          .length
          ? {
              delegatedAt,
            }
          : {}),
      },

      include: {
        assistant: {
          select: {
            id: true,
            name: true,
          },
        },
      },

      orderBy: {
        delegatedAt: "asc",
      },
    });

  const byAssistant =
    new Map();

  for (const delegation of delegations) {
    const key =
      delegation.assistantId;

    if (!byAssistant.has(key)) {
      byAssistant.set(key, {
        assistantId: key,

        assistantName:
          delegation.assistant
            ?.name ||
          "Unknown assistant",

        totalDelegated: 0,
        completed: 0,
        pending: 0,
      });
    }

    const summary =
      byAssistant.get(key);

    summary.totalDelegated += 1;

    if (delegation.completedAt) {
      summary.completed += 1;
    } else {
      summary.pending += 1;
    }
  }

  return Array.from(
    byAssistant.values(),
  ).map((summary) => ({
    ...summary,

    completionRate:
      summary.totalDelegated > 0
        ? Math.round(
            (summary.completed /
              summary.totalDelegated) *
              100,
          )
        : 0,
  }));
}

module.exports = {
  delegateSubmission,
  reassignDelegation,
  removeDelegation,
  bulkDelegateSubmissions,
  getSubmissionDelegationHistory,
  getDelegationCounts,
};
