const prisma = require("../config/prisma");
const storage = require("./storage.service");
const {
  getSubmissionFlagStatus,
} = require("./taskFlagging.service");

async function createTask({ title, description, teacherId, yearId, deadline, gradeOutOf, taskType, groupIds, allowLateSubmission, taskFile }) {
  if (!groupIds || groupIds.length === 0) {
    throw { status: 400, msg: "At least one groupId is required" };
  }

  let taskFileUrl = null;
  if (taskFile) {
    taskFileUrl = await storage.uploadBuffer(taskFile.buffer, taskFile.originalname, taskFile.mimetype, "tasks");
  }

  return prisma.task.create({
    data: {
      title,
      description,
      teacherId,
      yearId,
      deadline: new Date(deadline),
      gradeOutOf,
      taskType,
      taskFileUrl,
      allowLateSubmission: allowLateSubmission !== undefined ? allowLateSubmission : true,
      groups: { create: groupIds.map((groupId) => ({ groupId })) },
    },
    include: { groups: true },
  });
}

/** Teacher/assistant edits a task after creation — including toggling late-submission and replacing the file. */
async function updateTask(taskId, { title, description, deadline, gradeOutOf, taskType, allowLateSubmission, groupIds, taskFile }, user) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      groups: {
        select: { groupId: true },
      },
    },
  });
  if (!task) throw { status: 404, msg: "Task not found" };

  const isHeadAssistant =
    user?.role === "ASSISTANT" && user?.isHeadAssistant === true;

  if (user?.role === "ASSISTANT" && !isHeadAssistant) {
    const currentGroupIds = task.groups.map(({ groupId }) => groupId);
    const requestedGroupIds = groupIds || currentGroupIds;
    const groupIdsToCheck = [...new Set([...currentGroupIds, ...requestedGroupIds])];

    const assignmentCount = await prisma.assistantGroupAssignment.count({
      where: {
        assistantId: user.id,
        groupId: { in: groupIdsToCheck },
      },
    });

    if (assignmentCount !== groupIdsToCheck.length) {
      throw {
        status: 403,
        msg: "You can only edit tasks for groups assigned to you",
      };
    }
  }

  let taskFileUrl = task.taskFileUrl;
  if (taskFile) {
    if (taskFileUrl) await storage.deleteFile(taskFileUrl);
    taskFileUrl = await storage.uploadBuffer(taskFile.buffer, taskFile.originalname, taskFile.mimetype, "tasks");
  }

  const updatedDeadline = deadline ? new Date(deadline) : null;

  return prisma.$transaction(async (tx) => {
    const updatedTask = await tx.task.update({
      where: { id: taskId },
      data: {
        ...(title ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(updatedDeadline ? { deadline: updatedDeadline } : {}),
        ...(gradeOutOf !== undefined ? { gradeOutOf } : {}),
        ...(taskType !== undefined ? { taskType } : {}),
        ...(allowLateSubmission !== undefined ? { allowLateSubmission } : {}),
        ...(groupIds !== undefined
          ? {
              groups: {
                deleteMany: {},
                create: groupIds.map((groupId) => ({ groupId })),
              },
            }
          : {}),
        taskFileUrl,
      },
      include: {
        groups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (updatedDeadline) {
      const submissions = await tx.submission.findMany({
        where: { taskId },
        select: { id: true },
      });

      const submissionIds = submissions.map(({ id }) => id);

      await Promise.all([
        tx.submission.updateMany({
          where: {
            taskId,
            lastModifiedAt: { lte: updatedDeadline },
          },
          data: { lastModifiedAfterDeadline: false },
        }),
        tx.submission.updateMany({
          where: {
            taskId,
            lastModifiedAt: { gt: updatedDeadline },
          },
          data: { lastModifiedAfterDeadline: true },
        }),
        tx.submissionFile.updateMany({
          where: {
            submissionId: { in: submissionIds },
            uploadedAt: { lte: updatedDeadline },
          },
          data: { uploadedAfterDeadline: false },
        }),
        tx.submissionFile.updateMany({
          where: {
            submissionId: { in: submissionIds },
            uploadedAt: { gt: updatedDeadline },
          },
          data: { uploadedAfterDeadline: true },
        }),
      ]);
    }

    return updatedTask;
  });
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

async function createSignedFileUrl(objectKey) {
  if (!objectKey) {
    return null;
  }

  return storage.getSignedUrl(objectKey, 15);
}

async function addSignedSubmissionUrls(
  submission,
) {
  const [
    fileUrl,
    correctedFileUrl,
    files,
    correctedFiles,
  ] = await Promise.all([
    createSignedFileUrl(
      submission.fileUrl,
    ),

    createSignedFileUrl(
      submission.correctedFileUrl,
    ),

    Promise.all(
      (submission.files || []).map(
        async (file) => ({
          id: file.id,
          originalName:
            file.originalName,
          contentType:
            file.contentType,
          size: file.size,
          order: file.order,

          uploadedAfterDeadline:
            file.uploadedAfterDeadline,

          uploadedAt:
            file.uploadedAt,

          fileUrl:
            await createSignedFileUrl(
              file.objectKey,
            ),
        }),
      ),
    ),

    Promise.all(
      (
        submission.correctedFiles ||
        []
      ).map(
        async (file) => ({
          id: file.id,
          originalName:
            file.originalName,
          contentType:
            file.contentType,
          size: file.size,
          order: file.order,
          uploadedAt:
            file.uploadedAt,
          uploadedBy:
            file.uploadedBy || null,

          fileUrl:
            await createSignedFileUrl(
              file.objectKey,
            ),
        }),
      ),
    ),
  ]);

  return {
    ...submission,
    fileUrl,
    correctedFileUrl,
    files,
    correctedFiles,
  };
}

async function assertGroupAccess(groupId, user) {
  if (!user) {
    throw {
      status: 401,
      msg: "Unauthorized",
    };
  }

  if (isAdminLevel(user)) {
    return;
  }

  if (user.role === "STUDENT") {
    const membership = await prisma.groupMembership.findUnique({
      where: {
        groupId_studentId: {
          groupId,
          studentId: user.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw {
        status: 403,
        msg: "You do not have access to this group",
      };
    }

    return;
  }

  if (user.role === "ASSISTANT") {
    const assignment =
      await prisma.assistantGroupAssignment.findUnique({
        where: {
          assistantId_groupId: {
            assistantId: user.id,
            groupId,
          },
        },
        select: {
          id: true,
        },
      });

    if (!assignment) {
      throw {
        status: 403,
        msg: "You are not assigned to this group",
      };
    }

    return;
  }

  throw {
    status: 403,
    msg: "You do not have access to this group",
  };
}

async function listTasksForGroup(groupId, user) {
  await assertGroupAccess(groupId, user);

  const include = {
    groups: {
      include: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
  };

  if (user?.role === "STUDENT") {
    include.submissions = {
      where: {
        studentId: user.id,
      },
      select: {
        id: true,
        studentId: true,
        grade: true,
        comments: true,
        fileUrl: true,
        correctedFileUrl: true,
        submittedAt: true,
        gradedAt: true,
      },
    };
  } else if (isAdminLevel(user)) {
    include.submissions = {
      where: {
        grade: null,
        delegation: null,
      },
      select: {
        id: true,
        submittedAt: true,
        student: {
          select: {
            id: true,
            name: true,
            groupMemberships: {
              select: {
                groupId: true,
              },
            },
          },
        },
      },
      orderBy: {
        submittedAt: "asc",
      },
    };
  }

  return prisma.task.findMany({
    where: {
      groups: {
        some: {
          groupId,
        },
      },
    },

    include,

    orderBy: {
      createdAt: "desc",
    },
  });
}

async function getTaskWithSubmissions(taskId, user, groupId) {
  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
    },
    include: {
      submissions: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
            },
          },

          files: {
            orderBy: {
              order: "asc",
            },
          },

          correctedFiles: {
            include: {
              uploadedBy: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },

            orderBy: {
              order: "asc",
            },
          },

          gradedBy: {
            select: {
              id: true,
              name: true,
              role: true,
              isHeadAssistant: true,
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
            },
          },

          delegationHistory: {
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
                },
              },
            },

            orderBy: {
              createdAt: "desc",
            },
          },
        },
      },
      groups: {
        include: {
          group: {
            select: {
              id: true,
              name: true,

              assistantAssignments: {
                select: {
                  assistant: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      isHeadAssistant: true,
                      permissions: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!task) {
    throw {
      status: 404,
      msg: "Task not found",
    };
  }

  const taskGroupIds = task.groups.map(
    (taskGroup) => taskGroup.groupId,
  );

  const currentGroupId =
    groupId && String(groupId) !== "ALL"
      ? String(groupId)
      : null;

  if (
    currentGroupId &&
    !taskGroupIds.some(
      (taskGroupId) =>
        String(taskGroupId) === currentGroupId,
    )
  ) {
    throw {
      status: 400,
      msg: "The selected group is not assigned to this task",
    };
  }

  if (currentGroupId && task.submissions.length) {
    const memberships =
      await prisma.groupMembership.findMany({
        where: {
          groupId: currentGroupId,
          studentId: {
            in: task.submissions.map(
              (submission) => submission.studentId,
            ),
          },
        },
        select: { studentId: true },
      });

    const groupStudentIds = new Set(
      memberships.map(({ studentId }) => String(studentId)),
    );

    task.submissions = task.submissions.filter(
      (submission) =>
        groupStudentIds.has(String(submission.studentId)),
    );
  }

  if (!user) {
    throw {
      status: 401,
      msg: "Unauthorized",
    };
  }

  if (!isAdminLevel(user)) {
    if (user.role === "STUDENT") {
      const membershipCount =
        await prisma.groupMembership.count({
          where: {
            studentId: user.id,
            groupId: {
              in: taskGroupIds,
            },
          },
        });

      if (membershipCount === 0) {
        throw {
          status: 403,
          msg: "You do not have access to this task",
        };
      }

      // Students must only receive their own submission.
      task.submissions = task.submissions.filter(
        (submission) =>
          submission.studentId === user.id,
      );
    } else if (user.role === "ASSISTANT") {
        const assignmentCount =
          await prisma.assistantGroupAssignment.count({
            where: {
              assistantId: user.id,
              groupId: {
                in: taskGroupIds,
              },
            },
          });

        if (assignmentCount === 0) {
          throw {
            status: 403,
            msg: "You are not assigned to this task's groups",
          };
        }

        // Regular assistants only receive submissions
        // specifically delegated to them.
        task.submissions = task.submissions.filter(
          (submission) =>
            submission.delegation?.assistantId === user.id
        );
      } else {
      throw {
        status: 403,
        msg: "You do not have access to this task",
      };
    }
  }

  const submissionGroupNames =
    new Map();

  if (
    user.role !== "STUDENT" &&
    task.submissions.length
  ) {
    const memberships =
      await prisma.groupMembership.findMany({
        where: {
          studentId: {
            in: task.submissions.map(
              ({ studentId }) => studentId,
            ),
          },
          groupId: {
            in: taskGroupIds,
          },
        },
        select: {
          studentId: true,
          group: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    for (const membership of memberships) {
      const studentId = String(
        membership.studentId,
      );
      const groups =
        submissionGroupNames.get(
          studentId,
        ) || [];

      groups.push(membership.group);
      submissionGroupNames.set(
        studentId,
        groups,
      );
    }
  }

  task.submissions =
    task.submissions.map(
      (submission) => ({
        ...submission,
        student: submission.student
          ? {
              ...submission.student,
              groups:
                submissionGroupNames.get(
                  String(
                    submission.studentId,
                  ),
                ) || [],
            }
          : submission.student,
        ...getSubmissionFlagStatus(
          submission.grade,
          task.gradeOutOf,
        ),
      }),
    );

  const [taskFileUrl, signedSubmissions] =
    await Promise.all([
      createSignedFileUrl(task.taskFileUrl),

      Promise.all(
        task.submissions.map(
          addSignedSubmissionUrls
        )
      ),
    ]);

  return {
    ...task,
    taskFileUrl,
    submissions: signedSubmissions,
  };
}

module.exports = {
  createTask,
  updateTask,
  listTasksForGroup,
  getTaskWithSubmissions,
};
