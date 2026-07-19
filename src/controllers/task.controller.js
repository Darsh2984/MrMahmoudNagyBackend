const taskService = require("../services/task.service");

function parseGroupIds(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      throw new Error("groupIds must be an array");
    }

    return parsed;
  } catch {
    throw {
      status: 400,
      msg: "Invalid groupIds value",
    };
  }
}

function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  throw {
    status: 400,
    msg: "Invalid allowLateSubmission value",
  };
}

function parseGradeOutOf(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw {
      status: 400,
      msg: "Grade out of must be a positive number",
    };
  }

  return parsed;
}

function validateDeadline(value) {
  if (!value) {
    throw {
      status: 400,
      msg: "Deadline is required",
    };
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw {
      status: 400,
      msg: "Invalid deadline",
    };
  }

  return value;
}

async function createTask(req, res) {
  try {
    const title = req.body.title?.trim();

    if (!title) {
      return res.status(400).json({
        msg: "Task title is required",
      });
    }

    if (!req.body.yearId) {
      return res.status(400).json({
        msg: "Academic year is required",
      });
    }

    const groupIds = parseGroupIds(req.body.groupIds);
    const gradeOutOf = parseGradeOutOf(req.body.gradeOutOf);

    const allowLateSubmission = parseBoolean(
      req.body.allowLateSubmission,
      true,
    );

    const deadline = validateDeadline(req.body.deadline);

    if (groupIds.length === 0) {
      return res.status(400).json({
        msg: "At least one group is required",
      });
    }

    const task = await taskService.createTask({
      title,
      description: req.body.description?.trim() || null,
      groupIds,
      gradeOutOf,
      allowLateSubmission,
      deadline,
      yearId: req.body.yearId,
      teacherId: req.user.id,
      taskFile: req.file || null,
    });

    return res.status(201).json({
      msg: "Task created",
      task,
    });
  } catch (err) {
    console.error("Create task error:", err);

    return res.status(err.status || 500).json({
      msg:
        err.msg ||
        err.message ||
        "Error creating task",
    });
  }
}

async function updateTask(req, res) {
  try {
    const updateData = {
      taskFile: req.file || null,
    };

    if (req.body.title !== undefined) {
      const title = req.body.title.trim();

      if (!title) {
        return res.status(400).json({
          msg: "Task title cannot be empty",
        });
      }

      updateData.title = title;
    }

    if (req.body.description !== undefined) {
      updateData.description =
        req.body.description.trim();
    }

    if (req.body.deadline !== undefined) {
      updateData.deadline = validateDeadline(
        req.body.deadline,
      );
    }

    if (req.body.gradeOutOf !== undefined) {
      updateData.gradeOutOf = parseGradeOutOf(
        req.body.gradeOutOf,
      );
    }

    if (
      req.body.allowLateSubmission !== undefined
    ) {
      updateData.allowLateSubmission = parseBoolean(
        req.body.allowLateSubmission,
      );
    }

    const task = await taskService.updateTask(
      req.params.taskId,
      updateData,
    );

    return res.json({
      msg: "Task updated",
      task,
    });
  } catch (err) {
    console.error("Update task error:", err);

    return res.status(err.status || 500).json({
      msg:
        err.msg ||
        err.message ||
        "Error updating task",
    });
  }
}

async function listTasksForGroup(req, res) {
  try {
    const tasks = await taskService.listTasksForGroup(
      req.params.groupId,
      req.user,
    );

    return res.json(tasks);
  } catch (err) {
    console.error("List tasks error:", err);

    return res.status(err.status || 500).json({
      msg:
        err.msg ||
        err.message ||
        "Error listing tasks",
    });
  }
}

async function getTask(req, res) {
  try {
    const task = await taskService.getTaskWithSubmissions(
      req.params.taskId,
      req.user,
    );

    return res.json(task);
  } catch (err) {
    console.error("Get task error:", err);

    return res.status(err.status || 500).json({
      msg:
        err.msg ||
        err.message ||
        "Error fetching task",
    });
  }
}

module.exports = {
  createTask,
  updateTask,
  listTasksForGroup,
  getTask,
};