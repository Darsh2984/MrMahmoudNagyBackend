const express = require("express");
const router = express.Router();
const taskController = require("../controllers/task.controller");
const { requireAuth, requireAssistantPermission } = require("../middleware/rbac.middleware");

router.get("/group/:groupId", requireAuth, taskController.listTasksForGroup);
router.get("/:taskId", requireAuth, taskController.getTask);

router.post("/", requireAssistantPermission("canManageTasks"), taskController.createTask);

module.exports = router;
