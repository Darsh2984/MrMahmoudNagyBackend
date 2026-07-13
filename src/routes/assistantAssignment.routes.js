const express = require("express");
const router = express.Router();
const assignmentController = require("../controllers/assistantAssignment.controller");
const { requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

// Assigning assistants to groups is Teacher/Head only (per spec — Head can do everything
// except create/remove assistant accounts; assigning them to groups is fair game).
router.post("/", requireAdminLevel, assignmentController.assign);
router.delete("/:assistantId/:groupId", requireAdminLevel, assignmentController.unassign);

router.get("/assistant/:assistantId", requireAuth, assignmentController.listGroupsForAssistant);
router.get("/group/:groupId", requireAuth, assignmentController.listAssistantsForGroup);

module.exports = router;
