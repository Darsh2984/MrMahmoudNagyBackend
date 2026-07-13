const express = require("express");
const router = express.Router();
const questionController = require("../controllers/question.controller");
const { requireRole, requireAssistantPermission } = require("../middleware/rbac.middleware");
const { questionUpload } = require("../middleware/upload.middleware");

// Never exposed to students — a question's correctAnswer/markscheme would leak the answer.
router.get("/", requireRole("TEACHER", "ASSISTANT"), questionController.listQuestions);

router.post("/", requireAssistantPermission("canUploadResources"), questionUpload, questionController.createQuestion);
router.delete("/:questionId", requireAssistantPermission("canUploadResources"), questionController.deleteQuestion);

module.exports = router;
