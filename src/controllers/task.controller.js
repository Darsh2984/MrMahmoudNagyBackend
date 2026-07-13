const taskService = require("../services/task.service");

async function createTask(req, res) {
  try {
    const task = await taskService.createTask({ ...req.body, teacherId: req.user.id });
    res.json({ msg: "Task created", task });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating task" });
  }
}

async function listTasksForGroup(req, res) {
  try {
    const tasks = await taskService.listTasksForGroup(req.params.groupId);
    res.json(tasks);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing tasks" });
  }
}

async function getTask(req, res) {
  try {
    const task = await taskService.getTaskWithSubmissions(req.params.taskId);
    res.json(task);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching task" });
  }
}

module.exports = { createTask, listTasksForGroup, getTask };
