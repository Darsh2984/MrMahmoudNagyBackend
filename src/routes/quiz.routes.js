const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quiz.controller");
const quizStudentController = require("../controllers/quizStudent.controller");
const { requireAssistantPermission } = require("../middleware/rbac.middleware");

router.post("/", requireAssistantPermission("canManageQuizzes"), quizController.createQuiz);
router.get("/teacher", requireAssistantPermission("canManageQuizzes"), quizController.listQuizzesForTeacher);
router.get("/:quizId", requireAssistantPermission("canManageQuizzes"), quizController.getQuiz);
router.delete("/:quizId", requireAssistantPermission("canManageQuizzes"), quizController.deleteQuiz);

router.get("/:quizId/submissions", requireAssistantPermission("canManageQuizzes"), quizStudentController.listSubmissionsForQuiz);
router.patch(
  "/submissions/:submissionId/grade-written",
  requireAssistantPermission("canGradeHomework"),
  quizStudentController.gradeWrittenAnswer
);

module.exports = router;
