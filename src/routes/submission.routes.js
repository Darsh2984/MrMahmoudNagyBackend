const express = require("express");

const router = express.Router();

const submissionController =
  require("../controllers/submission.controller");

const {
  requireRole,
  requireAssistantPermission,
  requireAdminLevel,
} = require("../middleware/rbac.middleware");

const {
  homeworkFilesUpload,
} = require("../middleware/homeworkUpload.middleware");

const {
  correctedHomeworkUpload,
} = require("../middleware/correctedHomeworkUpload.middleware.js");

router.post(
  "/task/:taskId",
  requireRole("STUDENT"),
  homeworkFilesUpload,
  submissionController.submitHomework,
);

router.post(
  "/task/:taskId/uploads/prepare",
  requireRole("STUDENT"),
  submissionController.prepareHomeworkUploads,
);

router.post(
  "/task/:taskId/uploads/confirm",
  requireRole("STUDENT"),
  submissionController.confirmHomeworkUploads,
);

router.post(
  "/task/:taskId/uploads/abort",
  requireRole("STUDENT"),
  submissionController.abortHomeworkUploads,
);

router.get(
  "/task/:taskId/mine",
  requireRole("STUDENT"),
  submissionController.getMyHomeworkSubmission,
);

router.delete(
  "/:submissionId/files/:fileId",
  requireRole("STUDENT"),
  submissionController.deleteHomeworkFile,
);

router.patch(
  "/:submissionId/grade",
  requireAssistantPermission(
    "canGradeHomework",
  ),
  correctedHomeworkUpload,
  submissionController.gradeSubmission,
);

router.patch(
  "/:submissionId/reopen",
  requireAdminLevel,
  submissionController.reopenSubmission,
);

router.get(
  "/:submissionId/grading-history",
  requireAssistantPermission(
    "canGradeHomework",
  ),
  submissionController.getGradingHistory,
);

router.delete(
  "/:submissionId/corrected-files/:correctedFileId",
  requireAssistantPermission(
    "canGradeHomework",
  ),
  submissionController.deleteCorrectedFile,
);

module.exports = router;
