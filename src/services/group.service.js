const prisma = require("../config/prisma");
const { randomUUID } = require("crypto");
const studentSupportChatService = require("./studentSupportChat.service");
const { resolveTeacherId } = require("../utils/resolveTeacher");

async function createGroup({ name, yearId }, creator) {
  if (!creator || !["TEACHER", "ASSISTANT"].includes(creator.role)) {
    throw { status: 403, msg: "Teacher or Assistant only" };
  }

  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName || typeof yearId !== "string" || !yearId.trim()) {
    throw { status: 400, msg: "Group name and academic year are required" };
  }

  const teacherId = await resolveTeacherId(creator);
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

  if (year.teacherId !== teacherId) {
    throw { status: 403, msg: "You cannot create groups in this academic year" };
  }

  return prisma.group.create({
    data: {
      name: normalizedName,
      yearId,
      ...(creator.role === "ASSISTANT" && !creator.isHeadAssistant
        ? { assistantAssignments: { create: { assistantId: creator.id } } }
        : {}),
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

function normalizeSessionLinks(value) {
  if (!Array.isArray(value)) {
    throw {
      status: 400,
      msg: "Session links must be provided as a list.",
    };
  }

  if (value.length > 20) {
    throw {
      status: 400,
      msg: "A group can have a maximum of 20 session links.",
    };
  }

  const normalized = value.map((item, index) => {
    const title = String(item?.title || "").trim();
    const link = normalizeSessionLink(item?.link);

    if (!title) {
      throw {
        status: 400,
        msg: `Add a title for session link ${index + 1}.`,
      };
    }

    if (title.length > 100) {
      throw {
        status: 400,
        msg: `Session link ${index + 1} has a title longer than 100 characters.`,
      };
    }

    if (!link) {
      throw {
        status: 400,
        msg: `Add a URL for session link ${index + 1}.`,
      };
    }

    return {
      id: String(item?.id || randomUUID()),
      title,
      link,
    };
  });

  const uniqueIds = new Set(normalized.map(({ id }) => id));
  if (uniqueIds.size !== normalized.length) {
    throw {
      status: 400,
      msg: "Each session link must have a unique identifier.",
    };
  }

  return normalized;
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
        sessionLinks: true,
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

  const existingLinks = Array.isArray(group.sessionLinks)
    ? group.sessionLinks
    : [];

  const synchronizedLinks = normalizedSessionLink
    ? [
        {
          id: String(existingLinks[0]?.id || randomUUID()),
          title: String(existingLinks[0]?.title || "Online session"),
          link: normalizedSessionLink,
        },
        ...existingLinks.slice(1),
      ]
    : [];

  return prisma.group.update({
    where: {
      id: groupId,
    },
    data: {
      sessionLink:
        normalizedSessionLink,
      sessionLinks: synchronizedLinks,
    },
  });
}

async function updateGroupSessionLinks(groupId, sessionLinks) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });

  if (!group) {
    throw { status: 404, msg: "Group not found." };
  }

  const normalizedSessionLinks = normalizeSessionLinks(sessionLinks);

  return prisma.group.update({
    where: { id: groupId },
    data: {
      sessionLinks: normalizedSessionLinks,
      // Keep the legacy field synchronized for older app builds.
      sessionLink: normalizedSessionLinks[0]?.link || null,
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

async function assertCanManageStudentsInGroup({
  groupId,
  viewer,
  action = "manage",
}) {
  const isAdminLevel =
    viewer?.role === "TEACHER" ||
    (viewer?.role === "ASSISTANT" &&
      viewer?.isHeadAssistant === true);

  if (isAdminLevel) {
    return;
  }

  if (viewer?.role !== "ASSISTANT") {
    throw {
      status: 403,
      msg: `You cannot ${action} students in this group.`,
    };
  }

  const assignment =
    await prisma.assistantGroupAssignment.findUnique({
      where: {
        assistantId_groupId: {
          assistantId: viewer.id,
          groupId,
        },
      },
      select: { id: true },
    });

  if (!assignment) {
    throw {
      status: 403,
      msg: `You can only ${action} students in groups assigned to you.`,
    };
  }
}

async function addStudentsToGroup({
  groupId,
  studentId,
  studentIds,
  viewer,
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

  await assertCanManageStudentsInGroup({
    groupId,
    viewer,
    action: "add",
  });

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
  for (const studentId of idsToCreate) {
    await studentSupportChatService.ensureStudentSupportChat({
      groupId,
      studentId,
    });
  }

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
  viewer,
}) {
  const result = await addStudentsToGroup({
    groupId,
    studentId,
    viewer,
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
  viewer,
}) {
  await assertCanManageStudentsInGroup({
    groupId,
    viewer,
    action: "remove",
  });

  const membership = await prisma.groupMembership.findUnique({
    where: {
      groupId_studentId: {
        groupId,
        studentId,
      },
    },
    select: { id: true },
  });

  if (!membership) {
    throw {
      status: 404,
      msg: "Student is not assigned to this group.",
    };
  }

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
  updateGroupSessionLinks,
};
