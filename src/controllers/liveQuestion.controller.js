const liveQuestionService = require("../services/liveQuestion.service");

async function createLiveQuestion(req, res) {
  try {
    const question = await liveQuestionService.createLiveQuestion(req.body);
    res.json({ msg: "Live question created", question });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating live question" });
  }
}

async function submitAnswer(req, res) {
  try {
    const answer = await liveQuestionService.submitAnswer({
      liveQuestionId: req.params.liveQuestionId,
      studentId: req.user.id,
      file: req.file,
    });
    res.json({ msg: "Answer submitted", answer });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error submitting answer" });
  }
}

async function gradeAnswer(req, res) {
  try {
    const answer = await liveQuestionService.gradeAnswer({
      answerId: req.params.answerId,
      gradedById: req.user.id,
      grade: req.body.grade,
    });
    res.json({ msg: "Answer graded", answer });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error grading answer" });
  }
}

async function listAnswers(req, res) {
  try {
    const answers = await liveQuestionService.listAnswersForQuestion(req.params.liveQuestionId);
    res.json(answers);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing answers" });
  }
}

module.exports = { createLiveQuestion, submitAnswer, gradeAnswer, listAnswers };
