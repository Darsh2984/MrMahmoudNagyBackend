const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/session.controller");
const { requireAuth, requireAssistantPermission } = require("../middleware/rbac.middleware");

router.get("/group/:groupId", requireAuth, sessionController.listSessionsByGroup);
router.get("/:sessionId", requireAuth, sessionController.getSession);

router.post("/", requireAssistantPermission("canManageSessions"), sessionController.createSession);
router.post("/:sessionId/attendance", requireAssistantPermission("canManageSessions"), sessionController.markAttendance);

module.exports = router;
