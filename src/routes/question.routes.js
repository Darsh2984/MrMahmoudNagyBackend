const express = require("express");

const router = express.Router();

const questionController = require(
  "../controllers/question.controller"
);

const {
  requireRole,
  requireAssistantPermission,
} = require(
  "../middleware/rbac.middleware"
);

const {
  questionUpload,
} = require(
  "../middleware/upload.middleware"
);

// Staff-only reads.
//
// Correct answers and markschemes must
// never be exposed through student routes.
router.get(
  "/",
  requireRole(
    "TEACHER",
    "ASSISTANT"
  ),
  questionController.listQuestions
);

router.get(
  "/:questionId",
  requireRole(
    "TEACHER",
    "ASSISTANT"
  ),
  questionController.getQuestion
);

// Teacher and Head Assistant are allowed.
// A regular Assistant requires
// canUploadResources.
router.post(
  "/",
  requireAssistantPermission(
    "canUploadResources"
  ),
  questionUpload,
  questionController.createQuestion
);

router.patch(
  "/:questionId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  questionUpload,
  questionController.updateQuestion
);

router.delete(
  "/:questionId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  questionController.deleteQuestion
);

module.exports = router;