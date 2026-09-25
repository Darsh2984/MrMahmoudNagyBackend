const prisma = require("../config/prisma");

const { alertAssistantOfDelegation } = require("./staffAlert.service");
const {
  evaluateAssistantAssignments,
} = require("./autoDelegationPolicy.service");

const MAX_BULK_SUBMISSIONS = 100;
const BULK_DELEGATION_CONCURRENCY = 5;
const AUTO_DELEGATION_CONCURRENCY = 5;

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
  requiredGroupId,
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

  const eligibleGroupIds = requiredGroupId
    ? [String(requiredGroupId)]
    : taskGroupIds;

  if (
    requiredGroupId &&
    !taskGroupIds.some(
      (groupId) => String(groupId) === String(requiredGroupId),
    )
  ) {
    throw createServiceError(
      400,
      "The selected group is not assigned to this task.",
    );
  }

  const assignmentCount =
    await prisma
      .assistantGroupAssignment
      .count({
        where: {
          assistantId,

          groupId: {
            in: eligibleGroupIds,
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
  assistant,
  submission,
  title,
  body,
  count,
}) {
  try {
    await alertAssistantOfDelegation({
      assistant,
      submission,
      title,
      body,
      count,
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
  groupId,
  skipNotification = false,
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

  if (groupId) {
    const membershipCount = await prisma.groupMembership.count({
      where: {
        studentId: submission.studentId,
        groupId: String(groupId),
      },
    });

    if (membershipCount === 0) {
      throw createServiceError(
        400,
        "This student is not assigned to the selected group.",
      );
    }
  }

  const assistant =
    await getEligibleAssistant({
      assistantId,
      taskGroupIds,
      requiredGroupId: groupId,
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

  if (!skipNotification) {
    await notifyAssistantOfDelegation({
      assistant,

      submission,

      title:
        "Homework assigned for grading",

      body:
        `${submission.student?.name || "A student"} submitted ${submission.task?.title || "homework"} for you to grade.`,
    });
  }

  return delegation;
}

/**
 * Automatically delegates a new submission only when its student belongs to
 * exactly one of the task's groups and that group has exactly one assigned
 * assistant who can grade homework. Every ambiguous case remains undelegated.
 */
async function autoDelegateSubmission({
  submissionId,
  skipNotification = false,
}) {
  const submission = await getSubmissionForDelegation(submissionId);

  if (submission.grade !== null || submission.delegation) {
    return {
      delegated: false,
      reason: submission.delegation
        ? "ALREADY_DELEGATED"
        : "ALREADY_GRADED",
    };
  }

  if (
    submission.task.taskType !== "HOMEWORK" &&
    submission.submissionMethod !== "HARDCOPY"
  ) {
    return {
      delegated: false,
      reason: "NOT_HOMEWORK",
    };
  }

  const taskGroupIds = submission.task.groups.map(
    ({ groupId }) => groupId,
  );

  const memberships = await prisma.groupMembership.findMany({
    where: {
      studentId: submission.studentId,
      groupId: { in: taskGroupIds },
    },
    select: { groupId: true },
  });

  const relevantGroupIds = [
    ...new Set(memberships.map(({ groupId }) => String(groupId))),
  ];

  if (relevantGroupIds.length !== 1) {
    return {
      delegated: false,
      reason:
        relevantGroupIds.length === 0
          ? "NO_RELEVANT_GROUP"
          : "MULTIPLE_RELEVANT_GROUPS",
    };
  }

  const groupId = relevantGroupIds[0];
  const assignments = await prisma.assistantGroupAssignment.findMany({
    where: { groupId },
    select: {
      assistant: {
        select: {
          id: true,
          role: true,
          isHeadAssistant: true,
          permissions: true,
        },
      },
    },
  });

  const hardcopyMarker =
    submission.submissionMethod === "HARDCOPY" &&
    submission.hardcopyMarkedById
      ? assignments
          .map(({ assistant }) => assistant)
          .find(
            (assistant) =>
              assistant?.id === submission.hardcopyMarkedById &&
              assistant.role === "ASSISTANT" &&
              (assistant.isHeadAssistant === true ||
                assistant.permissions?.canGradeHomework === true),
          )
      : null;

  const assignmentDecision = hardcopyMarker
    ? { assistant: hardcopyMarker, reason: null }
    : evaluateAssistantAssignments(assignments);

  if (!assignmentDecision.assistant) {
    return {
      delegated: false,
      reason: assignmentDecision.reason,
      groupId,
    };
  }

  const assistant = assignmentDecision.assistant;
  const delegation = await delegateSubmission({
    submissionId,
    assistantId: assistant.id,
    delegatedById: submission.task.teacherId,
    groupId,
    reason: hardcopyMarker
      ? "Automatically delegated to the assistant who recorded the hardcopy submission."
      : "Automatically delegated because this group has one eligible assistant.",
    skipNotification: true,
  });

  if (!skipNotification) {
    notifyAssistantOfDelegation({
      assistant: delegation.assistant,
      submission,
      title: "Homework automatically assigned for grading",
      body: hardcopyMarker
        ? `${submission.student?.name || "A student"}'s hardcopy for ${submission.task?.title || "homework"} was assigned to you for grading.`
        : `${submission.student?.name || "A student"} submitted ${submission.task?.title || "homework"}. It was automatically assigned to you because you are the only eligible assistant for this group.`,
    }).catch((error) => {
      console.error(
        "Automatic delegation notification failed:",
        error.message,
      );
    });
  }

  return {
    delegated: true,
    delegation,
    groupId,
    assistantId: assistant.id,
    submission,
  };
}

/**
 * Reconciles existing ungraded Homework submissions and all hardcopy
 * submissions that have no delegation.
 * A group filter is used after assignment changes; without one this performs
 * the startup backfill. Notifications are grouped to avoid one email per paper.
 */
async function autoDelegateUndelegatedSubmissions({ groupId } = {}) {
  const pendingSubmissions = await prisma.submission.findMany({
    where: {
      grade: null,
      delegation: null,
      OR: [
        { submissionMethod: "HARDCOPY" },
        { task: { taskType: "HOMEWORK" } },
      ],
      ...(groupId
        ? {
            task: {
              groups: { some: { groupId: String(groupId) } },
            },
          }
        : {}),
    },
    select: { id: true },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
  });

  const outcomes = [];

  for (
    let index = 0;
    index < pendingSubmissions.length;
    index += AUTO_DELEGATION_CONCURRENCY
  ) {
    const batch = pendingSubmissions.slice(
      index,
      index + AUTO_DELEGATION_CONCURRENCY,
    );

    const batchOutcomes = await Promise.all(
      batch.map(async ({ id }) => {
        try {
          return await autoDelegateSubmission({
            submissionId: id,
            skipNotification: true,
          });
        } catch (error) {
          console.error(
            `Automatic delegation reconciliation failed for submission ${id}:`,
            error?.message || error,
          );
          return {
            delegated: false,
            reason: "ERROR",
          };
        }
      }),
    );

    outcomes.push(...batchOutcomes);
  }

  const delegated = outcomes.filter((outcome) => outcome.delegated);
  const notificationGroups = new Map();

  for (const outcome of delegated) {
    const key = `${outcome.assistantId}_${outcome.submission.taskId}`;
    const existing = notificationGroups.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    notificationGroups.set(key, {
      assistant: outcome.delegation.assistant,
      submission: outcome.submission,
      count: 1,
    });
  }

  await Promise.allSettled(
    [...notificationGroups.values()].map(({ assistant, submission, count }) =>
      notifyAssistantOfDelegation({
        assistant,
        submission,
        count,
        title: "Homework automatically assigned for grading",
        body: `${submission.student?.name || "A student"} submitted ${submission.task?.title || "homework"}. It was automatically assigned to you because you are the only eligible assistant for this group.`,
      }),
    ),
  );

  return {
    checked: pendingSubmissions.length,
    delegated: delegated.length,
    leftUndelegated: pendingSubmissions.length - delegated.length,
  };
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
  groupId,
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

  if (groupId) {
    const membershipCount = await prisma.groupMembership.count({
      where: {
        studentId: delegation.submission.studentId,
        groupId: String(groupId),
      },
    });

    if (membershipCount === 0) {
      throw createServiceError(
        400,
        "This student is not assigned to the selected group.",
      );
    }
  }

  const newAssistant =
    await getEligibleAssistant({
      assistantId,
      taskGroupIds,
      requiredGroupId: groupId,
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
    assistant: newAssistant,

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
  groupId,
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
              groupId,
              skipNotification: true,
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

  if (successful.length) {
    const [assistant, submission] = await Promise.all([
      prisma.user.findUnique({
        where: { id: assistantId },
        select: { id: true, name: true, email: true },
      }),
      getSubmissionForDelegation(successful[0].submissionId),
    ]);

    if (assistant) {
      await notifyAssistantOfDelegation({
        assistant,
        submission,
        title: "Homework submissions assigned for grading",
        body: `${successful.length} homework submission${successful.length === 1 ? "" : "s"} ${successful.length === 1 ? "has" : "have"} been delegated to you for correction.`,
        count: successful.length,
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
  autoDelegateSubmission,
  autoDelegateUndelegatedSubmissions,
  delegateSubmission,
  reassignDelegation,
  removeDelegation,
  bulkDelegateSubmissions,
  getSubmissionDelegationHistory,
  getDelegationCounts,
};
