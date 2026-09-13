const prisma = require("../config/prisma");

/**
 * Teacher/Head only: set a student's attendance mode
 * (ONGROUND / ONLINE).
 */
async function setAttendanceMode(
  studentId,
  attendanceMode
) {
  if (
    !["ONGROUND", "ONLINE"].includes(
      attendanceMode
    )
  ) {
    throw {
      status: 400,
      msg:
        "attendanceMode must be ONGROUND or ONLINE",
    };
  }

  const student =
    await prisma.user.findUnique({
      where: {
        id: studentId,
      },
    });

  if (!student || student.role !== "STUDENT") {
    throw {
      status: 404,
      msg: "Student not found",
    };
  }

  return prisma.user.update({
    where: {
      id: studentId,
    },
    data: {
      attendanceMode,
    },
    select: {
      id: true,
      name: true,
      attendanceMode: true,
    },
  });
}

async function getStudentProfile(studentId) {
  const student =
    await prisma.user.findUnique({
      where: {
        id: studentId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        attendanceMode: true,
        accessCode: true,

        schoolId: true,
        school: {
          select: {
            id: true,
            name: true,
          },
        },

        desiredYearId: true,
        desiredYear: {
          select: {
            id: true,
            name: true,
          },
        },

        fatherName: true,
        fatherPhone: true,
        motherName: true,
        motherPhone: true,

        groupMemberships: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
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
      },
    });

  if (!student || student.role !== "STUDENT") {
    throw {
      status: 404,
      msg: "Student not found",
    };
  }

  return student;
}

/**
 * Students not yet in any group.
 */
async function listUnassignedStudents({ viewer, groupId } = {}) {
  const isRegularAssistant =
    viewer?.role === "ASSISTANT" &&
    viewer?.isHeadAssistant !== true;

  if (isRegularAssistant) {
    if (!groupId) {
      throw {
        status: 400,
        msg: "Select an assigned group first.",
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
        msg: "You can only view students while managing an assigned group.",
      };
    }
  }

  return prisma.user.findMany({
    where: {
      role: "STUDENT",
      groupMemberships: {
        none: {},
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      accessCode: true,

      schoolId: true,
      school: {
        select: {
          id: true,
          name: true,
        },
      },

      desiredYearId: true,
      desiredYear: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      {
        desiredYear: {
          name: "asc",
        },
      },
      {
        school: {
          name: "asc",
        },
      },
      {
        name: "asc",
      },
    ],
  });
}

/**
 * Updates a student's own fields plus their
 * parent contact information.
 */
async function updateStudent(
  studentId,
  {
    name,
    email,
    studentPhone,
    fatherName,
    fatherPhone,
    motherName,
    motherPhone,
  }
) {
  const student =
    await prisma.user.findUnique({
      where: {
        id: studentId,
      },
    });

  if (!student || student.role !== "STUDENT") {
    throw {
      status: 404,
      msg: "Student not found",
    };
  }

  return prisma.user.update({
    where: {
      id: studentId,
    },
    data: {
      ...(name
        ? {
            name,
          }
        : {}),

      ...(email
        ? {
            email: email.toLowerCase(),
          }
        : {}),

      ...(studentPhone !== undefined
        ? {
            phone: studentPhone || null,
          }
        : {}),

      ...(fatherName !== undefined
        ? {
            fatherName:
              fatherName || null,
          }
        : {}),

      ...(fatherPhone !== undefined
        ? {
            fatherPhone:
              fatherPhone || null,
          }
        : {}),

      ...(motherName !== undefined
        ? {
            motherName:
              motherName || null,
          }
        : {}),

      ...(motherPhone !== undefined
        ? {
            motherPhone:
              motherPhone || null,
          }
        : {}),
    },
  });
}

async function deleteStudent(studentId) {
  const student =
    await prisma.user.findUnique({
      where: {
        id: studentId,
      },
    });

  if (!student || student.role !== "STUDENT") {
    throw {
      status: 404,
      msg: "Student not found",
    };
  }

  return prisma.user.delete({
    where: {
      id: studentId,
    },
  });
}

module.exports = {
  setAttendanceMode,
  getStudentProfile,
  listUnassignedStudents,
  updateStudent,
  deleteStudent,
};
