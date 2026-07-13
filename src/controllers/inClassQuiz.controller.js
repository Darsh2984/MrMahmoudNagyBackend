const service = require("../services/inClassQuiz.service");

async function createInClassQuiz(req, res) {
  try {
    const quiz = await service.createInClassQuiz({ ...req.body, teacherId: req.user.id });
    res.json({ msg: "In-class quiz created", quiz });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating quiz" });
  }
}

async function listForGroup(req, res) {
  try {
    const quizzes = await service.listForGroup(req.params.groupId);
    res.json(quizzes);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing quizzes" });
  }
}

async function updateGrades(req, res) {
  try {
    const quiz = await service.updateGrades(req.params.quizId, req.body.studentGrades);
    res.json({ msg: "Grades updated", quiz });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating grades" });
  }
}

async function updateQuizDetails(req, res) {
  try {
    const quiz = await service.updateQuizDetails(req.params.quizId, req.body);
    res.json({ msg: "Quiz updated", quiz });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating quiz" });
  }
}

async function deleteInClassQuiz(req, res) {
  try {
    await service.deleteInClassQuiz(req.params.quizId);
    res.json({ msg: "Quiz deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting quiz" });
  }
}

module.exports = { createInClassQuiz, listForGroup, updateGrades, updateQuizDetails, deleteInClassQuiz };
