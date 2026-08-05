const express = require("express");

const router = express.Router();

const submissionController =
  require("../controllers/submission.controller");

const {
  requireRole,
  requireAssistantPermission,
} = require("../middleware/rbac.middleware");

const {
  homeworkFilesUpload,
} = require("../middleware/homeworkUpload.middleware");

const {
  correctedHomeworkUpload,
} = require("../middleware/correctedHomeworkUpload.middleware");

router.post(
  "/task/:taskId",
  requireRole("STUDENT"),
  homeworkFilesUpload,
  submissionController.submitHomework,
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

router.delete(
  "/:submissionId/corrected-files/:correctedFileId",
  requireAssistantPermission(
    "canGradeHomework",
  ),
  submissionController.deleteCorrectedFile,
);

module.exports = router;