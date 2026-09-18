const express = require("express");

const router = express.Router();

const aiCorrectionController = require(
  "../controllers/aiCorrection.controller"
);

const {
  aiCorrectionUpload,
} = require(
  "../middleware/aiCorrectionUpload.middleware"
);

const {
  requireTeacherOnly,
  requireRole,
  requireAssistantPermission,
} = require("../middleware/rbac.middleware");

const taskController = require("../controllers/taskAIGrading.controller");
const { taskAIReferencesUpload } = require("../middleware/aiCorrectionUpload.middleware");

router.get("/tasks/:taskId/references", requireRole("TEACHER", "ASSISTANT"), taskController.getPack);
router.post("/tasks/:taskId/references", requireAssistantPermission("canGradeHomework"),
  taskController.authorizeTask, taskAIReferencesUpload, taskController.uploadPack);
router.post("/tasks/:taskId/references/retry", requireAssistantPermission("canGradeHomework"), taskController.retryPack);
router.post("/tasks/:taskId/references/approve", requireAssistantPermission("canGradeHomework"), taskController.approvePack);
router.get("/submissions/:submissionId", requireRole("TEACHER", "ASSISTANT"), taskController.getCorrections);
router.post("/submissions/:submissionId", requireAssistantPermission("canGradeHomework"), taskController.startCorrection);

router.post(
  "/correct-paper",
  requireTeacherOnly,
  aiCorrectionUpload,
  aiCorrectionController.correctPaper
);

module.exports = router;
