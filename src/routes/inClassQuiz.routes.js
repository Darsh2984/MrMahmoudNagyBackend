const express = require("express");
const router = express.Router();
const controller = require("../controllers/inClassQuiz.controller");
const { requireAuth, requireAssistantPermission } = require("../middleware/rbac.middleware");

router.get("/:groupId", requireAuth, controller.listForGroup);

router.post("/", requireAssistantPermission("canManageQuizzes"), controller.createInClassQuiz);
router.put("/:quizId/grades", requireAssistantPermission("canGradeHomework"), controller.updateGrades);
router.put("/:quizId", requireAssistantPermission("canManageQuizzes"), controller.updateQuizDetails);
router.delete("/:quizId", requireAssistantPermission("canManageQuizzes"), controller.deleteInClassQuiz);

module.exports = router;
