const submissionService = require("../services/submission.service");

async function submitHomework(req, res) {
  try {
    const submission = await submissionService.submitHomework({
      taskId: req.params.taskId,
      studentId: req.user.id,
      file: req.file,
    });
    res.json({ msg: "Homework submitted", submission });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error submitting homework" });
  }
}

async function gradeSubmission(req, res) {
  try {
    const submission = await submissionService.gradeSubmission({
      submissionId: req.params.submissionId,
      grade: req.body.grade,
      comments: req.body.comments,
      correctedFile: req.file,
    });
    res.json({ msg: "Submission graded", submission });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error grading submission" });
  }
}

module.exports = { submitHomework, gradeSubmission };
