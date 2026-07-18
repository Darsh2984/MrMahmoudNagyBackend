const express = require("express");
const router = express.Router();
const taskController = require("../controllers/task.controller");
const { requireAuth, requireAssistantPermission } = require("../middleware/rbac.middleware");
const { materialUpload } = require("../middleware/upload.middleware");

router.get("/group/:groupId", requireAuth, taskController.listTasksForGroup);
router.get("/:taskId", requireAuth, taskController.getTask);

router.post("/", requireAssistantPermission("canManageTasks"), materialUpload.single("file"), taskController.createTask);
router.patch("/:taskId", requireAssistantPermission("canManageTasks"), materialUpload.single("file"), taskController.updateTask);

module.exports = router;
