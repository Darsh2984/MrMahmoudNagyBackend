const express = require("express");
const router = express.Router();
const groupController = require("../controllers/group.controller");
const { requireAuth, requireAdminLevel, requireRole } = require("../middleware/rbac.middleware");

// Reads
router.get("/year/:yearId", requireAuth, groupController.listGroupsByYear);
router.get("/:groupId", requireAuth, groupController.getGroup);

// Assistants may create groups; other group management remains Teacher/Head only.
router.post("/", requireRole("TEACHER", "ASSISTANT"), groupController.createGroup);
router.patch("/:groupId/session-link",requireAdminLevel,groupController.updateSessionLink);
router.patch("/:groupId", requireAdminLevel, groupController.updateGroup);
router.delete("/:groupId", requireAdminLevel, groupController.deleteGroup);
router.post("/:groupId/students", requireRole("TEACHER", "ASSISTANT"), groupController.addStudent);
router.delete("/:groupId/students/:studentId", requireAdminLevel, groupController.removeStudent);

module.exports = router;
