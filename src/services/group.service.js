const prisma = require("../config/prisma");

async function createGroup({ name, yearId }) {
  const year = await prisma.year.findUnique({ where: { id: yearId } });
  if (!year) throw { status: 404, msg: "Year not found" };
  return prisma.group.create({ data: { name, yearId } });
}

async function listGroupsByYear(yearId, viewer) {
  const isRegularAssistant =
    viewer.role === "ASSISTANT" &&
    !viewer.isHeadAssistant;

  const isStudent = viewer.role === "STUDENT";

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

  const isStudent = viewer.role === "STUDENT";

  const group = await prisma.group.findFirst({
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
      msg: "Group not found or you are not assigned to it",
    };
  }

  return group;
}

async function updateGroup(groupId, { name }) {
  return prisma.group.update({ where: { id: groupId }, data: { name } });
}

async function deleteGroup(groupId) {
  const memberCount = await prisma.groupMembership.count({ where: { groupId } });
  if (memberCount > 0) {
    throw { status: 400, msg: "Cannot delete a group that still has students — remove students first" };
  }
  return prisma.group.delete({ where: { id: groupId } });
}

async function addStudentToGroup({ groupId, studentId }) {
  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== "STUDENT") throw { status: 400, msg: "studentId must reference a STUDENT" };

  const existing = await prisma.groupMembership.findUnique({
    where: { groupId_studentId: { groupId, studentId } },
  });
  if (existing) throw { status: 400, msg: "Student is already in this group" };

  return prisma.groupMembership.create({ data: { groupId, studentId } });
}

async function removeStudentFromGroup({ groupId, studentId }) {
  return prisma.groupMembership.delete({
    where: { groupId_studentId: { groupId, studentId } },
  });
}

module.exports = {
  createGroup,
  listGroupsByYear,
  getGroupWithMembers,
  updateGroup,
  deleteGroup,
  addStudentToGroup,
  removeStudentFromGroup,
};
