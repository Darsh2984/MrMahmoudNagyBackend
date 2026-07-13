const express = require("express");
const router = express.Router();
const delegationController = require("../controllers/delegation.controller");
const { requireAdminLevel, requireAssistantPermission } = require("../middleware/rbac.middleware");
const { materialUpload } = require("../middleware/upload.middleware");

// Only Teacher/Head decide who a submission gets delegated to
router.post("/", requireAdminLevel, delegationController.delegateSubmission);

// Assistant grades what was delegated to them
router.patch(
  "/:delegationId/grade",
  requireAssistantPermission("canGradeHomework"),
  materialUpload.single("correctedFile"),
  delegationController.gradeDelegatedSubmission
);

// Counts only (no financials) — for Mr. Nagy to base compensation decisions on, outside this system
router.get("/counts", requireAdminLevel, delegationController.getDelegationCounts);

module.exports = router;
