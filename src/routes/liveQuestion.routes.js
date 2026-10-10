const express = require("express");
const router = express.Router();
const liveQuestionController = require("../controllers/liveQuestion.controller");
const { requireAuth, requireRole, requireAssistantPermission } = require("../middleware/rbac.middleware");
const { materialUpload } = require("../middleware/upload.middleware");

// Teacher poses the question (covered by canManageSessions — it's part of running the session)
router.post(
  "/",
  requireAssistantPermission("canManageSessions"),
  materialUpload.single("questionImage"),
  liveQuestionController.createLiveQuestion
);

// Student photographs and uploads their answer
router.post(
  "/:liveQuestionId/answer",
  requireRole("STUDENT"),
  (req, res, next) => { req.answerRequestStartedAt = new Date(); next(); },
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

const liveAI = require("../services/liveQuestionAI.service");
const staff = [requireAuth, requireRole("TEACHER", "ASSISTANT")];
const aiHandler = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    console.error("Live question AI:", error.message);
    res.status(error.status || 500).json({ msg: error.message || "AI grading failed." });
  }
};
router.get("/:questionId/ai", staff, aiHandler(async (req, res) => {
  res.json(await liveAI.getState(req.params.questionId, req.user));
}));
router.post("/:questionId/ai/references", staff,
  materialUpload.fields([{ name: "questionPaper", maxCount: 1 }, { name: "markScheme", maxCount: 1 }]),
  aiHandler(async (req, res) => { res.status(202).json(await liveAI.upload(req.params.questionId, req.user, req.files)); }));
router.post("/:questionId/ai/approve", staff, aiHandler(async (req, res) => {
  await liveAI.approve(req.params.questionId, req.body.packId, req.user); res.json({ ok: true });
}));
router.post("/answer/:answerId/ai", staff, aiHandler(async (req, res) => {
  res.status(202).json(await liveAI.start(req.params.answerId, req.user));
}));
router.post("/ai/corrections/:id/confirm", staff, aiHandler(async (req, res) => {
  await liveAI.review(req.params.id, req.user, req.body.result); res.json({ ok: true });
}));
router.get("/ai/corrections/:id/pdf", staff, aiHandler(async (req, res) => {
  const result = await liveAI.exportPdf(req.params.id, req.user);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", "attachment; filename=corrected.pdf; filename*=UTF-8''" + encodeURIComponent(result.fileName));
  res.send(result.body);
}));
module.exports = router;
