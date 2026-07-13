const questionService = require("../services/question.service");

async function createQuestion(req, res) {
  try {
    // multipart/form-data can't send real arrays cleanly — topicIds arrives as a JSON string.
    const topicIds = typeof req.body.topicIds === "string" ? JSON.parse(req.body.topicIds) : req.body.topicIds;

    const question = await questionService.createQuestion({
      type: req.body.type,
      correctAnswer: req.body.correctAnswer,
      teacherId: req.user.id,
      questionFile: req.files?.questionFile?.[0],
      markschemeFile: req.files?.markschemeFile?.[0],
      topicIds,
    });
    res.json({ msg: "Question created", question });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating question" });
  }
}

async function listQuestions(req, res) {
  try {
    const questions = await questionService.listQuestionsForTeacher(req.user.id, req.query);
    res.json(questions);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing questions" });
  }
}

async function deleteQuestion(req, res) {
  try {
    await questionService.deleteQuestion(req.params.questionId);
    res.json({ msg: "Question deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting question" });
  }
}

module.exports = { createQuestion, listQuestions, deleteQuestion };
