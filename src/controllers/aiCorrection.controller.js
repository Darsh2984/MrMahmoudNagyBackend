const aiCorrectionService = require(
  "../services/aiCorrection.service"
);

function sendError(res, error, fallback) {
  return res
    .status(error.status || 500)
    .json({
      msg:
        error.msg ||
        error.message ||
        fallback,
    });
}

async function correctPaper(req, res) {
  try {
    const result =
      await aiCorrectionService.correctPaper({
        files: req.files,
        teacherNote: req.body.teacherNote,
      });

    return res.json({
      msg: "Paper corrected successfully.",
      result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't correct the paper."
    );
  } finally {
    await aiCorrectionService.removeTempFiles(
      req.files
    );
  }
}

module.exports = {
  correctPaper,
};