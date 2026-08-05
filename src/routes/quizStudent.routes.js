const express = require("express");

const router = express.Router();

const quizStudentController =
  require("../controllers/quizStudent.controller");

const {
  requireRole,
} = require("../middleware/rbac.middleware");

const {
  paperQuizFilesUpload,
} = require("../middleware/paperQuizUpload.middleware");

router.get(
  "/mine",
  requireRole("STUDENT"),
  quizStudentController.listMyQuizzes,
);

// Paper quiz routes.

router.get(
  "/:quizId/paper/status",
  requireRole("STUDENT"),
  quizStudentController.getPaperQuizStatus,
);

router.get(
  "/:quizId/paper",
  requireRole("STUDENT"),
  quizStudentController.getPaperQuiz,
);

router.post(
  "/:quizId/paper/files",
  requireRole("STUDENT"),
  paperQuizFilesUpload,
  quizStudentController.uploadPaperFiles,
);

router.delete(
  "/:quizId/paper/files/:fileId",
  requireRole("STUDENT"),
  quizStudentController.deletePaperFile,
);

router.post(
  "/:quizId/paper/submit",
  requireRole("STUDENT"),
  quizStudentController.submitPaperQuiz,
);

// MCQ quiz routes.

router.post(
  "/:quizId/start",
  requireRole("STUDENT"),
  quizStudentController.startQuiz,
);

router.get(
  "/:quizId/review",
  requireRole("STUDENT"),
  quizStudentController
    .getMyQuizReview,
);

router.get(
  "/:quizId/take",
  requireRole("STUDENT"),
  quizStudentController.getQuizForTaking,
);

router.post(
  "/:quizId/questions/:questionId/answer",
  requireRole("STUDENT"),
  express.json(),
  quizStudentController.answerQuestion,
);

router.post(
  "/:quizId/submit",
  requireRole("STUDENT"),
  quizStudentController.submitQuiz,
);

router.get(
  "/:quizId/my-submission",
  requireRole("STUDENT"),
  quizStudentController.getMySubmission,
);

module.exports = router;