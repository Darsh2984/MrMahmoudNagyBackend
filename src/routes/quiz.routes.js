const express = require(
  "express",
);

const router =
  express.Router();

const quizController = require(
  "../controllers/quiz.controller",
);

const {
  requireRole,
  requireAssistantPermission,
} = require(
  "../middleware/rbac.middleware",
);

const {
  correctedPaperQuizUpload,
} = require(
  "../middleware/correctedPaperQuizUpload.middleware",
);

/*
 * Reading the quiz-management
 * bank is allowed for Teacher and
 * Assistants.
 */
router.get(
  "/",
  requireRole(
    "TEACHER",
    "ASSISTANT",
  ),
  quizController.listQuizzes,
);

/*
 * Submission review requires quiz
 * management permission.
 *
 * Teacher and Head Assistant pass
 * automatically. Regular Assistant
 * requires canManageQuizzes.
 */
router.get(
  "/:quizId/submissions",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController
    .listQuizSubmissions,
);

router.get(
  "/:quizId/submissions/:submissionId",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController
    .getQuizSubmissionDetail,
);

router.patch(
  "/:quizId/submissions/:submissionId/grade-paper",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  correctedPaperQuizUpload,
  quizController
    .gradePaperSubmission,
);

router.delete(
  "/:quizId/submissions/:submissionId/corrected-files/:fileId",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController
    .deleteCorrectedPaperFile,
);

router.get(
  "/:quizId",
  requireRole(
    "TEACHER",
    "ASSISTANT",
  ),
  quizController.getQuiz,
);

/*
 * Teacher and Head Assistant pass
 * automatically. A regular Assistant
 * requires canManageQuizzes.
 */
router.post(
  "/",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController.createQuiz,
);

router.patch(
  "/:quizId",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController.updateQuiz,
);

router.post(
  "/:quizId/publish",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController.publishQuiz,
);

router.post(
  "/:quizId/close",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController.closeQuiz,
);

router.post(
  "/:quizId/reopen",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController.reopenQuiz,
);

router.delete(
  "/:quizId",
  requireAssistantPermission(
    "canManageQuizzes",
  ),
  quizController.deleteQuiz,
);

module.exports = router;