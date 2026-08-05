const submissionService =
  require("../services/submission.service");

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

  if (
    error?.data !== undefined
  ) {
    payload.data = error.data;
  }

  return res
    .status(error?.status || 500)
    .json(payload);
}

async function submitHomework(
  req,
  res,
) {
  try {
    const submission =
      await submissionService.submitHomework({
        taskId: req.params.taskId,
        studentId: req.user.id,
        files:
          req.uploadedFiles || [],
      });

    return res.status(201).json({
      msg:
        "Homework files uploaded successfully.",
      submission,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error submitting homework.",
    );
  }
}

async function getMyHomeworkSubmission(
  req,
  res,
) {
  try {
    const submission =
      await submissionService.getMyHomeworkSubmission({
        taskId: req.params.taskId,
        studentId: req.user.id,
      });

    return res.json({
      submission,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching homework submission.",
    );
  }
}

async function deleteHomeworkFile(
  req,
  res,
) {
  try {
    const submission =
      await submissionService.deleteHomeworkFile({
        submissionId:
          req.params.submissionId,

        fileId:
          req.params.fileId,

        studentId:
          req.user.id,
      });

    return res.json({
      msg: "Homework file deleted.",
      submission,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error deleting homework file.",
    );
  }
}

async function gradeSubmission(
  req,
  res,
) {
  try {
    const submission =
      await submissionService.gradeSubmission({
        submissionId:
          req.params.submissionId,

        grade: req.body.grade,

        comments:
          req.body.comments,

        correctedFiles:
          req.correctedFiles || [],

        gradedBy: req.user,
      });

    return res.json({
      msg:
        "Submission graded successfully.",
      submission,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error grading submission.",
    );
  }
}

async function deleteCorrectedFile(
  req,
  res,
) {
  try {
    const result =
      await submissionService.deleteCorrectedFile({
        submissionId:
          req.params.submissionId,

        correctedFileId:
          req.params.correctedFileId,

        requestedBy:
          req.user,
      });

    return res.json({
      msg:
        "Corrected file deleted.",
      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error deleting corrected file.",
    );
  }
}

module.exports = {
  submitHomework,
  getMyHomeworkSubmission,
  deleteHomeworkFile,
  gradeSubmission,
  deleteCorrectedFile,
};