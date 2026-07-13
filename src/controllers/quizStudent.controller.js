const quizStudentService = require("../services/quizStudent.service");

async function listMyQuizzes(req, res) {
  try {
    const quizzes = await quizStudentService.listQuizzesForStudent(req.user.id);
    res.json(quizzes);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing quizzes" });
  }
}

async function startQuiz(req, res) {
  try {
    const result = await quizStudentService.startQuiz(req.params.quizId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error starting quiz" });
  }
}

async function answerQuestion(req, res) {
  try {
    const submission = await quizStudentService.answerQuestion({
      quizId: req.params.quizId,
      studentId: req.user.id,
      questionId: req.params.questionId,
      answerText: req.body.answerText,
      file: req.file,
    });
    res.json({ msg: "Answer recorded", submission });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error recording answer" });
  }
}

async function submitQuiz(req, res) {
  try {
    const submission = await quizStudentService.submitQuiz(req.params.quizId, req.user.id);
    res.json({ msg: "Quiz submitted", submission });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error submitting quiz" });
  }
}

async function getMySubmission(req, res) {
  try {
    const submission = await quizStudentService.getSubmissionDetail(req.params.quizId, req.user.id);
    res.json(submission);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching submission" });
  }
}

async function listSubmissionsForQuiz(req, res) {
  try {
    const submissions = await quizStudentService.listSubmissionsForQuiz(req.params.quizId);
    res.json(submissions);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing submissions" });
  }
}

async function gradeWrittenAnswer(req, res) {
  try {
    const submission = await quizStudentService.gradeWrittenAnswer({
      submissionId: req.params.submissionId,
      questionId: req.body.questionId,
      isCorrect: req.body.isCorrect,
    });
    res.json({ msg: "Answer graded", submission });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error grading answer" });
  }
}

module.exports = {
  listMyQuizzes,
  startQuiz,
  answerQuestion,
  submitQuiz,
  getMySubmission,
  listSubmissionsForQuiz,
  gradeWrittenAnswer,
};
