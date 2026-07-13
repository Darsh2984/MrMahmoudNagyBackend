const quizService = require("../services/quiz.service");

async function createQuiz(req, res) {
  try {
    const quiz = await quizService.createQuiz({ ...req.body, teacherId: req.user.id });
    res.json({ msg: "Quiz created", quiz });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating quiz" });
  }
}

async function listQuizzesForTeacher(req, res) {
  try {
    const quizzes = await quizService.listQuizzesForTeacher(req.user.id);
    res.json(quizzes);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing quizzes" });
  }
}

async function getQuiz(req, res) {
  try {
    const quiz = await quizService.getQuizForTeacher(req.params.quizId, req.user.id);
    res.json(quiz);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching quiz" });
  }
}

async function deleteQuiz(req, res) {
  try {
    await quizService.deleteQuiz(req.params.quizId, req.user.id);
    res.json({ msg: "Quiz deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting quiz" });
  }
}

module.exports = { createQuiz, listQuizzesForTeacher, getQuiz, deleteQuiz };
