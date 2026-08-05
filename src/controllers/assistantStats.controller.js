const statsService =
  require("../services/assistantStats.service");

function sendError(
  res,
  error,
  fallbackMessage,
) {
  return res
    .status(error?.status || 500)
    .json({
      msg:
        error?.msg ||
        error?.message ||
        fallbackMessage,
    });
}

async function getAssistantStats(
  req,
  res,
) {
  try {
    const stats =
      await statsService.getAssistantStats(
        req.params.assistantId,
        {
          from: req.query.from,
          to: req.query.to,

          recentLimit:
            req.query.recentLimit,
        },
      );

    return res.json(stats);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching assistant statistics.",
    );
  }
}

async function getAllAssistantStats(
  req,
  res,
) {
  try {
    const stats =
      await statsService.getAllAssistantStats({
        from: req.query.from,
        to: req.query.to,

        recentLimit:
          req.query.recentLimit,
      });

    return res.json(stats);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching assistant statistics.",
    );
  }
}

module.exports = {
  getAssistantStats,
  getAllAssistantStats,
};