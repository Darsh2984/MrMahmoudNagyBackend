const prisma = require("../config/prisma");

async function createTask({ title, description, teacherId, yearId, deadline, gradeOutOf, groupIds }) {
  if (!groupIds || groupIds.length === 0) {
    throw { status: 400, msg: "At least one groupId is required" };
  }

  return prisma.task.create({
    data: {
      title,
      description,
      teacherId,
      yearId,
      deadline: new Date(deadline),
      gradeOutOf,
      groups: { create: groupIds.map((groupId) => ({ groupId })) },
    },
    include: { groups: true },
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

module.exports = { createTask, listTasksForGroup, getTaskWithSubmissions };
