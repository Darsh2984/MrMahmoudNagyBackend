const express = require("express");
const router = express.Router();
const groupController = require("../controllers/group.controller");
const { requireAuth, requireAdminLevel, requireRole } = require("../middleware/rbac.middleware");

// Reads
router.get("/year/:yearId", requireAuth, groupController.listGroupsByYear);
router.get("/:groupId", requireAuth, groupController.getGroup);

// Writes — group management is Teacher/Head only (not a per-assistant-permission thing,
// since groups define the org structure itself, not day-to-day content)
router.post("/", requireAdminLevel, groupController.createGroup);
router.patch("/:groupId/session-link",requireAdminLevel,groupController.updateSessionLink);
router.patch("/:groupId", requireAdminLevel, groupController.updateGroup);
router.delete("/:groupId", requireAdminLevel, groupController.deleteGroup);
router.post("/:groupId/students", requireRole("TEACHER", "ASSISTANT"), groupController.addStudent);
router.delete("/:groupId/students/:studentId", requireAdminLevel, groupController.removeStudent);

module.exports = router;
