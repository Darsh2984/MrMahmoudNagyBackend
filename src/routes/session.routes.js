const express = require("express");
const router = express.Router();

const sessionController = require("../controllers/session.controller");
const {
  requireAuth,
  requireAssistantPermission,
} = require("../middleware/rbac.middleware");

router.get(
  "/group/:groupId",
  requireAuth,
  sessionController.listSessionsByGroup
);

router.get(
  "/:sessionId",
  requireAuth,
  sessionController.getSession
);

router.post(
  "/",
  requireAssistantPermission("canManageSessions"),
  sessionController.createSession
);

router.patch(
  "/:sessionId",
  requireAssistantPermission("canManageSessions"),
  sessionController.updateSession
);

router.delete(
  "/:sessionId",
  requireAssistantPermission("canManageSessions"),
  sessionController.deleteSession
);

router.post(
  "/:sessionId/attendance",
  requireAssistantPermission("canManageSessions"),
  sessionController.markAttendance
);

module.exports = router;