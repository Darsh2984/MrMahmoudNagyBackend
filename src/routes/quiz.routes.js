const express = require("express");

const router = express.Router();

const quizController = require(
  "../controllers/quiz.controller"
);

const {
  requireRole,
  requireAssistantPermission,
} = require(
  "../middleware/rbac.middleware"
);

// Teacher and Assistants can view the
// shared teacher quiz bank.
router.get(
  "/",
  requireRole("TEACHER", "ASSISTANT"),
  quizController.listQuizzes
);

router.get(
  "/:quizId",
  requireRole("TEACHER", "ASSISTANT"),
  quizController.getQuiz
);

// Teacher and Head Assistant pass automatically.
// Regular Assistants require canManageQuizzes.
router.post(
  "/",
  requireAssistantPermission(
    "canManageQuizzes"
  ),
  quizController.createQuiz
);

router.patch(
  "/:quizId",
  requireAssistantPermission(
    "canManageQuizzes"
  ),
  quizController.updateQuiz
);

router.post(
  "/:quizId/publish",
  requireAssistantPermission(
    "canManageQuizzes"
  ),
  quizController.publishQuiz
);

router.post(
  "/:quizId/close",
  requireAssistantPermission(
    "canManageQuizzes"
  ),
  quizController.closeQuiz
);

router.post(
  "/:quizId/reopen",
  requireAssistantPermission(
    "canManageQuizzes"
  ),
  quizController.reopenQuiz
);

router.delete(
  "/:quizId",
  requireAssistantPermission(
    "canManageQuizzes"
  ),
  quizController.deleteQuiz
);

module.exports = router;