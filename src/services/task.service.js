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

async function listTasksForGroup(groupId) {
  return prisma.task.findMany({
    where: { groups: { some: { groupId } } },
    orderBy: { deadline: "asc" },
  });
}

async function getTaskWithSubmissions(taskId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      submissions: {
        include: {
          student: { select: { id: true, name: true } },
          delegation: { include: { assistant: { select: { id: true, name: true } } } },
        },
      },
      groups: { include: { group: { select: { id: true, name: true } } } },
    },
  });
  if (!task) throw { status: 404, msg: "Task not found" };
  return task;
}

module.exports = { createTask, updateTask, listTasksForGroup, getTaskWithSubmissions };
