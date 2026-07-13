const express = require("express");
const router = express.Router();
const liveQuestionController = require("../controllers/liveQuestion.controller");
const { requireAuth, requireRole, requireAssistantPermission } = require("../middleware/rbac.middleware");
const { materialUpload } = require("../middleware/upload.middleware");

// Teacher poses the question (covered by canManageSessions — it's part of running the session)
router.post("/", requireAssistantPermission("canManageSessions"), liveQuestionController.createLiveQuestion);

// Student photographs and uploads their answer
router.post(
  "/:liveQuestionId/answer",
  requireRole("STUDENT"),
  materialUpload.single("file"),
  liveQuestionController.submitAnswer
);

// Assistant grades immediately
router.patch(
  "/answer/:answerId/grade",
  requireAssistantPermission("canGradeLiveQuestions"),
  liveQuestionController.gradeAnswer
);

router.get("/:liveQuestionId/answers", requireAuth, liveQuestionController.listAnswers);

module.exports = router;
