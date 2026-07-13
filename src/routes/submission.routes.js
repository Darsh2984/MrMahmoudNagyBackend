const express = require("express");
const router = express.Router();
const submissionController = require("../controllers/submission.controller");
const { requireRole, requireAssistantPermission } = require("../middleware/rbac.middleware");
const { materialUpload } = require("../middleware/upload.middleware");

// Student submits their homework file
router.post(
  "/task/:taskId",
  requireRole("STUDENT"),
  materialUpload.single("file"),
  submissionController.submitHomework
);

// Direct grading (no delegation) — Teacher/Head or an assistant with canGradeHomework
router.patch(
  "/:submissionId/grade",
  requireAssistantPermission("canGradeHomework"),
  materialUpload.single("correctedFile"),
  submissionController.gradeSubmission
);

module.exports = router;
