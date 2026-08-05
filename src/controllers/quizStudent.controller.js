const quizStudentService =
  require("../services/quizStudent.service");

const paperQuizService =
  require("../services/paperQuiz.service");

const paperQuizSubmissionService =
  require("../services/paperQuizSubmission.service");

function sendError(
  res,
  error,
  fallbackMessage,
) {
  const payload = {
    msg:
      error?.msg ||
      error?.message ||
      fallbackMessage,
  };

  if (error?.data !== undefined) {
    payload.data = error.data;
  }

  return res
    .status(error?.status || 500)
    .json(payload);
}

async function listMyQuizzes(req, res) {
  try {
    const quizzes =
      await quizStudentService.listQuizzesForStudent(
        req.user.id,
      );

    return res.json(quizzes);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error listing quizzes.",
    );
  }
}

async function startQuiz(req, res) {
  try {
    const result =
      await quizStudentService.startQuiz(
        req.params.quizId,
        req.user.id,
      );

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error starting quiz.",
    );
  }
}

async function getQuizForTaking(
  req,
  res,
) {
  try {
    const quiz =
      await quizStudentService.getQuizForTaking(
        req.params.quizId,
        req.user.id,
      );

    return res.json(quiz);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching quiz.",
    );
  }
}

async function answerQuestion(
  req,
  res,
) {
  try {
    const result =
      await quizStudentService.answerQuestion({
        quizId: req.params.quizId,
        studentId: req.user.id,
        questionId:
          req.params.questionId,
        answerText:
          req.body.answerText,
      });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error recording answer.",
    );
  }
}

async function submitQuiz(req, res) {
  try {
    const submission =
      await quizStudentService.submitQuiz(
        req.params.quizId,
        req.user.id,
      );

    return res.json({
      msg: submission.isAutoSubmitted
        ? "Quiz automatically submitted."
        : "Quiz submitted.",

      submission,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error submitting quiz.",
    );
  }
}

async function getMySubmission(
  req,
  res,
) {
  try {
    const submission =
      await quizStudentService.getSubmissionDetail(
        req.params.quizId,
        req.user.id,
      );

    return res.json(submission);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching submission.",
    );
  }
}

async function getPaperQuiz(req, res) {
  try {
    const result =
      await paperQuizService.generateStudentPaper({
        quizId: req.params.quizId,
        studentId: req.user.id,
      });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error generating Paper quiz.",
    );
  }
}

async function getPaperQuizStatus(
  req,
  res,
) {
  try {
    const result =
      await paperQuizService.getStudentPaperStatus({
        quizId: req.params.quizId,
        studentId: req.user.id,
      });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching Paper quiz status.",
    );
  }
}

async function uploadPaperFiles(
  req,
  res,
) {
  try {
    const result =
      await paperQuizSubmissionService.uploadPaperFiles({
        quizId: req.params.quizId,
        studentId: req.user.id,
        files: req.files,
      });

    return res.status(201).json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error uploading Paper quiz files.",
    );
  }
}

async function deletePaperFile(
  req,
  res,
) {
  try {
    const result =
      await paperQuizSubmissionService.deletePaperFile({
        quizId: req.params.quizId,
        studentId: req.user.id,
        fileId: req.params.fileId,
      });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error deleting Paper quiz file.",
    );
  }
}

async function submitPaperQuiz(
  req,
  res,
) {
  try {
    const result =
      await paperQuizSubmissionService.submitPaperQuiz({
        quizId: req.params.quizId,
        studentId: req.user.id,
      });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error submitting Paper quiz.",
    );
  }
}

async function listSubmissionsForQuiz(
  req,
  res,
) {
  try {
    const submissions =
      await quizStudentService.listSubmissionsForQuiz(
        req.params.quizId,
      );

    return res.json(submissions);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error listing submissions.",
    );
  }
}

module.exports = {
  listMyQuizzes,
  startQuiz,
  getQuizForTaking,
  answerQuestion,
  submitQuiz,
  getMySubmission,

  getPaperQuiz,
  getPaperQuizStatus,
  uploadPaperFiles,
  deletePaperFile,
  submitPaperQuiz,

  listSubmissionsForQuiz,
};