const prisma = require("../config/prisma");

const DEFAULT_RECENT_LIMIT = 12;
const MAX_RECENT_LIMIT = 50;

function createServiceError(status, msg) {
  const error = new Error(msg);
  error.status = status;
  error.msg = msg;
  return error;
}

function parseOptionalDate(value, fieldName) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createServiceError(
      400,
      `Invalid ${fieldName} date.`,
    );
  }

  return parsed;
}

function buildDateRange({
  from,
  to,
  fieldName = "createdAt",
}) {
  const parsedFrom = parseOptionalDate(
    from,
    "from",
  );

  const parsedTo = parseOptionalDate(
    to,
    "to",
  );

  if (
    parsedFrom &&
    parsedTo &&
    parsedFrom > parsedTo
  ) {
    throw createServiceError(
      400,
      '"from" must be earlier than or equal to "to".',
    );
  }

  if (!parsedFrom && !parsedTo) {
    return {};
  }

  return {
    [fieldName]: {
      ...(parsedFrom
        ? {
            gte: parsedFrom,
          }
        : {}),

      ...(parsedTo
        ? {
            lte: parsedTo,
          }
        : {}),
    },
  };
}

function parseRecentLimit(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_RECENT_LIMIT;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw createServiceError(
      400,
      "recentLimit must be a positive integer.",
    );
  }

  return Math.min(parsed, MAX_RECENT_LIMIT);
}

function calculateAverageTurnaroundHours(delegations) {
  const completedDurations = delegations
    .filter(
      (delegation) =>
        delegation.completedAt &&
        delegation.delegatedAt,
    )
    .map((delegation) => {
      const delegatedAt = new Date(
        delegation.delegatedAt,
      ).getTime();

      const completedAt = new Date(
        delegation.completedAt,
      ).getTime();

      return completedAt - delegatedAt;
    })
    .filter(
      (duration) =>
        Number.isFinite(duration) &&
        duration >= 0,
    );

  if (!completedDurations.length) {
    return null;
  }

  const totalMilliseconds =
    completedDurations.reduce(
      (total, duration) =>
        total + duration,
      0,
    );

  const averageMilliseconds =
    totalMilliseconds /
    completedDurations.length;

  return Number(
    (
      averageMilliseconds /
      (1000 * 60 * 60)
    ).toFixed(1),
  );
}

async function assertAssistantExists(
  assistantId,
) {
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
      },
    });

  if (
    !assistant ||
    assistant.role !== "ASSISTANT"
  ) {
    throw createServiceError(
      404,
      "Assistant not found.",
    );
  }

  return assistant;
}

/**
 * Returns ticket statistics for one assistant.
 */
async function getTicketStats(
  assistantId,
  { from, to } = {},
) {
  const dateFilter = buildDateRange({
    from,
    to,
    fieldName: "createdAt",
  });

  const tickets =
    await prisma.ticket.findMany({
      where: {
        assignedAssistantId:
          assistantId,

        ...dateFilter,
      },

      select: {
        id: true,
        status: true,
      },
    });

  const ticketIds = tickets.map(
    (ticket) => ticket.id,
  );

  let replied = 0;

  if (ticketIds.length) {
    const repliedTicketIds =
      await prisma.ticketMessage.findMany({
        where: {
          ticketId: {
            in: ticketIds,
          },

          senderId: assistantId,
          senderType: "ASSISTANT",
        },

        distinct: ["ticketId"],

        select: {
          ticketId: true,
        },
      });

    replied =
      repliedTicketIds.length;
  }

  return {
    opened: tickets.length,
    replied,

    resolvedConfirmed:
      tickets.filter(
        (ticket) =>
          ticket.status ===
          "CONFIRMED_RESOLVED",
      ).length,

    reopened:
      tickets.filter(
        (ticket) =>
          ticket.status ===
          "REOPENED",
      ).length,

    pendingConfirmation:
      tickets.filter(
        (ticket) =>
          ticket.status ===
          "RESOLVED_PENDING_CONFIRM",
      ).length,

    stillOpen:
      tickets.filter(
        (ticket) =>
          ticket.status === "OPEN",
      ).length,
  };
}

/**
 * Returns delegated-homework statistics and
 * recent delegated submissions for one assistant.
 */
async function getHomeworkStats(
  assistantId,
  {
    from,
    to,
    recentLimit,
  } = {},
) {
  const delegationDateFilter =
    buildDateRange({
      from,
      to,
      fieldName: "delegatedAt",
    });

  const limit =
    parseRecentLimit(recentLimit);

  const delegations =
    await prisma.delegation.findMany({
      where: {
        assistantId,
        ...delegationDateFilter,
      },

      include: {
        submission: {
          select: {
            id: true,
            grade: true,
            gradedAt: true,
            lastModifiedAfterDeadline:
              true,

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
                deadline: true,
                gradeOutOf: true,

                groups: {
                  select: {
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
          },
        },

        delegatedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },

      orderBy: {
        delegatedAt: "desc",
      },
    });


  const completedDelegations =
    delegations.filter(
      (delegation) =>
        Boolean(
          delegation.completedAt,
        ) ||
        delegation.submission
          ?.grade !== null,
    );

  const pendingDelegations =
    delegations.filter(
      (delegation) =>
        !delegation.completedAt &&
        delegation.submission
          ?.grade === null,
    );

  const totalDelegated =
    delegations.length;

  const completed =
    completedDelegations.length;

  const pending =
    pendingDelegations.length;

  const completionRate =
    totalDelegated > 0
      ? Math.round(
          (completed /
            totalDelegated) *
            100,
        )
      : 0;

  const averageTurnaroundHours =
    calculateAverageTurnaroundHours(
      completedDelegations,
    );

  const recentDelegations =
    delegations
      .slice(0, limit)
      .map((delegation) => {
        const submission =
          delegation.submission;

        const task =
          submission?.task;

        
        const isPending =
          !delegation.completedAt &&
          submission?.grade === null;

        
        return {
          delegationId:
            delegation.id,

          submissionId:
            submission?.id || null,

          status:
            delegation.completedAt ||
            submission?.grade !== null
              ? "COMPLETED"
              : "PENDING",

          delegatedAt:
            delegation.delegatedAt,

          completedAt:
            delegation.completedAt,

          delegatedBy:
            delegation.delegatedBy,

          student:
            submission?.student || null,

          task: task
            ? {
                id: task.id,
                title: task.title,
                deadline:
                  task.deadline,
                gradeOutOf:
                  task.gradeOutOf,

                groups:
                  (
                    task.groups || []
                  )
                    .map(
                      (taskGroup) =>
                        taskGroup.group,
                    )
                    .filter(Boolean),
              }
            : null,

          grade:
            submission?.grade ??
            null,

          gradedAt:
            submission?.gradedAt ||
            null,

          modifiedAfterDeadline:
            Boolean(
              submission
                ?.lastModifiedAfterDeadline,
            ),


          taskLink:
            task?.id
              ? `/tasks/${task.id}`
              : null,
        };
      });

  return {
    totalDelegated,
    pending,
    completed,

    completionRate,

    averageTurnaroundHours,

    recentDelegations,
  };
}

/**
 * Complete Assistant dashboard statistics.
 */
async function getAssistantStats(
  assistantId,
  options = {},
) {
  const assistant =
    await assertAssistantExists(
      assistantId,
    );

  const [tickets, homework] =
    await Promise.all([
      getTicketStats(
        assistantId,
        options,
      ),

      getHomeworkStats(
        assistantId,
        options,
      ),
    ]);

  return {
    assistant: {
      id: assistant.id,
      name: assistant.name,
      email: assistant.email,
      isHeadAssistant:
        assistant.isHeadAssistant,
    },

    period: {
      from:
        options.from || null,

      to:
        options.to || null,
    },

    tickets,
    homework,
  };
}

/**
 * Teacher/Head Assistant overview for every
 * assistant.
 */
async function getAllAssistantStats(
  options = {},
) {
  const assistants =
    await prisma.user.findMany({
      where: {
        role: "ASSISTANT",
      },

      select: {
        id: true,
        name: true,
        email: true,
        isHeadAssistant: true,
      },

      orderBy: [
        {
          isHeadAssistant: "desc",
        },
        {
          name: "asc",
        },
      ],
    });

  const results =
    await Promise.all(
      assistants.map(
        async (assistant) => {
          const [
            tickets,
            homework,
          ] = await Promise.all([
            getTicketStats(
              assistant.id,
              options,
            ),

            getHomeworkStats(
              assistant.id,
              options,
            ),
          ]);

          return {
            assistantId:
              assistant.id,

            assistantName:
              assistant.name,

            assistantEmail:
              assistant.email,

            isHeadAssistant:
              assistant.isHeadAssistant,

            tickets,
            homework,
          };
        },
      ),
    );

  return {
    period: {
      from:
        options.from || null,

      to:
        options.to || null,
    },

    assistants: results,
  };
}

module.exports = {
  getAssistantStats,
  getAllAssistantStats,
  getTicketStats,
  getHomeworkStats,
};