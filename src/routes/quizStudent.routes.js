const express = require("express");
const router = express.Router();
const quizStudentController = require("../controllers/quizStudent.controller");
const { requireRole } = require("../middleware/rbac.middleware");
const { materialUpload } = require("../middleware/upload.middleware");

router.get("/mine", requireRole("STUDENT"), quizStudentController.listMyQuizzes);
router.post("/:quizId/start", requireRole("STUDENT"), quizStudentController.startQuiz);

// Per-question answer — MCQ sends { answerText } as JSON, WRITTEN sends a photo file.
// materialUpload accepts both PDF/image, matching how written answers get captured elsewhere.
router.post(
  "/:quizId/questions/:questionId/answer",
  requireRole("STUDENT"),
  materialUpload.single("file"),
  quizStudentController.answerQuestion
);

router.post("/:quizId/submit", requireRole("STUDENT"), quizStudentController.submitQuiz);
router.get("/:quizId/my-submission", requireRole("STUDENT"), quizStudentController.getMySubmission);

module.exports = router;
