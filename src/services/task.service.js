const prisma = require("../config/prisma");
const storage = require("./storage.service");

async function createTask({ title, description, teacherId, yearId, deadline, gradeOutOf, groupIds, allowLateSubmission, taskFile }) {
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
      taskFileUrl,
      allowLateSubmission: allowLateSubmission !== undefined ? allowLateSubmission : true,
      groups: { create: groupIds.map((groupId) => ({ groupId })) },
    },
    include: { groups: true },
  });
}

/** Teacher/assistant edits a task after creation — including toggling late-submission and replacing the file. */
async function updateTask(taskId, { title, description, deadline, gradeOutOf, allowLateSubmission, taskFile }) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw { status: 404, msg: "Task not found" };

  let taskFileUrl = task.taskFileUrl;
  if (taskFile) {
    if (taskFileUrl) await storage.deleteFile(taskFileUrl);
    taskFileUrl = await storage.uploadBuffer(taskFile.buffer, taskFile.originalname, taskFile.mimetype, "tasks");
  }

  return prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(deadline ? { deadline: new Date(deadline) } : {}),
      ...(gradeOutOf !== undefined ? { gradeOutOf } : {}),
      ...(allowLateSubmission !== undefined ? { allowLateSubmission } : {}),
      taskFileUrl,
    },
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

  return prisma.task.findMany({
    where: {
      groups: {
        some: {
          groupId,
        },
      },
    },
    orderBy: {
      deadline: "asc",
    },
  });
}

async function getTaskWithSubmissions(taskId, user) {
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
        },
      },
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

  if (!task) {
    throw {
      status: 404,
      msg: "Task not found",
    };
  }

  const taskGroupIds = task.groups.map(
    (taskGroup) => taskGroup.groupId,
  );

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
    } else {
      throw {
        status: 403,
        msg: "You do not have access to this task",
      };
    }
  }

  return task;
}

module.exports = { createTask, updateTask, listTasksForGroup, getTaskWithSubmissions };
