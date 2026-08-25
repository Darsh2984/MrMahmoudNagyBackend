const prisma = require("../config/prisma");

async function createGroup({ name, yearId }) {
  const year = await prisma.year.findUnique({
    where: {
      id: yearId,
    },
  });

  if (!year) {
    throw {
      status: 404,
      msg: "Year not found",
    };
  }

  return prisma.group.create({
    data: {
      name,
      yearId,
    },
  });
}

async function listGroupsByYear(yearId, viewer) {
  const isRegularAssistant =
    viewer.role === "ASSISTANT" &&
    !viewer.isHeadAssistant;

  const isStudent =
    viewer.role === "STUDENT";

  return prisma.group.findMany({
    where: {
      yearId,

      ...(isRegularAssistant
        ? {
            assistantAssignments: {
              some: {
                assistantId: viewer.id,
              },
            },
          }
        : {}),

      ...(isStudent
        ? {
            members: {
              some: {
                studentId: viewer.id,
              },
            },
          }
        : {}),
    },

    orderBy: {
      createdAt: "asc",
    },

    include: {
      _count: {
        select: {
          members: true,
        },
      },
    },
  });
}

async function getGroupWithMembers(groupId, viewer) {
  const isRegularAssistant =
    viewer.role === "ASSISTANT" &&
    !viewer.isHeadAssistant;

  const isStudent =
    viewer.role === "STUDENT";

  const group =
    await prisma.group.findFirst({
      where: {
        id: groupId,

        ...(isRegularAssistant
          ? {
              assistantAssignments: {
                some: {
                  assistantId: viewer.id,
                },
              },
            }
          : {}),

        ...(isStudent
          ? {
              members: {
                some: {
                  studentId: viewer.id,
                },
              },
            }
          : {}),
      },

      include: {
        year: {
          select: {
            id: true,
            name: true,
          },
        },

        members: {
          where: isStudent
            ? {
                studentId: viewer.id,
              }
            : undefined,

          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
                attendanceMode: true,

                school: {
                  select: {
                    id: true,
                    name: true,
                  },
                },

                desiredYear: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },

        assistantAssignments: isStudent
          ? false
          : {
              include: {
                assistant: {
                  select: {
                    id: true,
                    name: true,
                    isHeadAssistant: true,
                  },
                },
              },
            },
      },
    });

  if (!group) {
    throw {
      status: 404,
      msg:
        "Group not found or you are not assigned to it",
    };
  }

  return group;
}

async function updateGroup(groupId, { name }) {
  return prisma.group.update({
    where: {
      id: groupId,
    },
    data: {
      name,
    },
  });
}

function normalizeSessionLink(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const trimmed =
    String(value).trim();

  if (!trimmed) {
    return null;
  }

  let parsed;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw {
      status: 400,
      msg:
        "Session link must be a valid URL.",
    };
  }

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw {
      status: 400,
      msg:
        "Session link must start with http:// or https://.",
    };
  }

  return trimmed;
}

async function updateGroupSessionLink(
  groupId,
  sessionLink
) {
  const group =
    await prisma.group.findUnique({
      where: {
        id: groupId,
      },
      select: {
        id: true,
        name: true,
        sessionLink: true,
      },
    });

  if (!group) {
    throw {
      status: 404,
      msg: "Group not found.",
    };
  }

  const normalizedSessionLink =
    normalizeSessionLink(sessionLink);

  return prisma.group.update({
    where: {
      id: groupId,
    },
    data: {
      sessionLink:
        normalizedSessionLink,
    },
  });
}

async function deleteGroup(groupId) {
  const memberCount =
    await prisma.groupMembership.count({
      where: {
        groupId,
      },
    });

  if (memberCount > 0) {
    throw {
      status: 400,
      msg:
        "Cannot delete a group that still has students — remove students first",
    };
  }

  return prisma.group.delete({
    where: {
      id: groupId,
    },
  });
}

function normalizeStudentIds({
  studentId,
  studentIds,
}) {
  const ids = Array.isArray(studentIds)
    ? studentIds
    : studentId
      ? [studentId]
      : [];

  return Array.from(
    new Set(
      ids
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
}

async function addStudentsToGroup({
  groupId,
  studentId,
  studentIds,
}) {
  const normalizedStudentIds =
    normalizeStudentIds({
      studentId,
      studentIds,
    });

  if (!normalizedStudentIds.length) {
    throw {
      status: 400,
      msg:
        "Select at least one student.",
    };
  }

  const group =
    await prisma.group.findUnique({
      where: {
        id: groupId,
      },
      select: {
        id: true,
      },
    });

  if (!group) {
    throw {
      status: 404,
      msg: "Group not found.",
    };
  }

  const students =
    await prisma.user.findMany({
      where: {
        id: {
          in: normalizedStudentIds,
        },
        role: "STUDENT",
      },
      select: {
        id: true,
      },
    });

  if (
    students.length !==
    normalizedStudentIds.length
  ) {
    throw {
      status: 400,
      msg:
        "One or more selected students are invalid.",
    };
  }

  const existingMemberships =
    await prisma.groupMembership.findMany({
      where: {
        groupId,
        studentId: {
          in: normalizedStudentIds,
        },
      },
      select: {
        studentId: true,
      },
    });

  const existingIds = new Set(
    existingMemberships.map(
      (membership) => membership.studentId
    )
  );

  const idsToCreate =
    normalizedStudentIds.filter(
      (id) => !existingIds.has(id)
    );

  if (!idsToCreate.length) {
    throw {
      status: 400,
      msg:
        "All selected students are already in this group.",
    };
  }

  await prisma.groupMembership.createMany({
    data: idsToCreate.map((id) => ({
      groupId,
      studentId: id,
    })),
    skipDuplicates: true,
  });

  return {
    added: idsToCreate.length,
    skipped:
      normalizedStudentIds.length -
      idsToCreate.length,
    studentIds: idsToCreate,
  };
}

async function addStudentToGroup({
  groupId,
  studentId,
}) {
  const result = await addStudentsToGroup({
    groupId,
    studentId,
  });

  return prisma.groupMembership.findUnique({
    where: {
      groupId_studentId: {
        groupId,
        studentId:
          result.studentIds[0],
      },
    },
  });
}

async function removeStudentFromGroup({
  groupId,
  studentId,
}) {
  return prisma.groupMembership.delete({
    where: {
      groupId_studentId: {
        groupId,
        studentId,
      },
    },
  });
}

module.exports = {
  createGroup,
  listGroupsByYear,
  getGroupWithMembers,
  updateGroup,
  deleteGroup,
  addStudentToGroup,
  addStudentsToGroup,
  removeStudentFromGroup,
  updateGroupSessionLink,
};