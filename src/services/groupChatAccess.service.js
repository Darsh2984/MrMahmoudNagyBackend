const prisma = require("../config/prisma");

function createServiceError(
  status,
  msg,
) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  return error;
}

function isAdminLevel(user) {
  return (
    user?.role === "TEACHER" ||
    (
      user?.role === "ASSISTANT" &&
      user?.isHeadAssistant === true
    )
  );
}

async function assertGroupChatAccess(
  groupId,
  user,
) {
  if (!user) {
    throw createServiceError(
      401,
      "Authentication required.",
    );
  }

  if (!groupId) {
    throw createServiceError(
      400,
      "Group ID is required.",
    );
  }

  const group = await prisma.group.findUnique({
    where: {
      id: String(groupId),
    },

    select: {
      id: true,
      name: true,
      yearId: true,

      year: {
        select: {
          id: true,
          name: true,
          teacherId: true,
        },
      },

      members: {
        where: {
          studentId: user.id,
        },

        select: {
          id: true,
        },

        take: 1,
      },

      assistantAssignments: {
        where: {
          assistantId: user.id,
        },

        select: {
          id: true,
        },

        take: 1,
      },
    },
  });

  if (!group) {
    throw createServiceError(
      404,
      "Group not found.",
    );
  }

  if (isAdminLevel(user)) {
    return group;
  }

  if (
    user.role === "STUDENT" &&
    group.members.length > 0
  ) {
    return group;
  }

  if (
    user.role === "ASSISTANT" &&
    group.assistantAssignments.length > 0
  ) {
    return group;
  }

  throw createServiceError(
    403,
    "You do not have access to this group chat.",
  );
}

async function listAccessibleGroupIds(
  user,
) {
  if (!user) {
    throw createServiceError(
      401,
      "Authentication required.",
    );
  }

  if (isAdminLevel(user)) {
    const groups =
      await prisma.group.findMany({
        select: {
          id: true,
        },
      });

    return groups.map(
      (group) => group.id,
    );
  }

  if (user.role === "STUDENT") {
    const memberships =
      await prisma.groupMembership.findMany({
        where: {
          studentId: user.id,
        },

        select: {
          groupId: true,
        },
      });

    return memberships.map(
      (membership) =>
        membership.groupId,
    );
  }

  if (user.role === "ASSISTANT") {
    const assignments =
      await prisma.assistantGroupAssignment.findMany({
        where: {
          assistantId: user.id,
        },

        select: {
          groupId: true,
        },
      });

    return assignments.map(
      (assignment) =>
        assignment.groupId,
    );
  }

  return [];
}

module.exports = {
  assertGroupChatAccess,
  listAccessibleGroupIds,
  isAdminLevel,
};