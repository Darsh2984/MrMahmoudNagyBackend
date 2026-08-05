const delegationService =
  require("../services/delegation.service");

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
    payload.data =
      error.data;
  }

  return res
    .status(error?.status || 500)
    .json(payload);
}

async function delegateSubmission(
  req,
  res,
) {
  try {
    const delegation =
      await delegationService.delegateSubmission({
        submissionId:
          req.body.submissionId,

        assistantId:
          req.body.assistantId,

        delegatedById:
          req.user.id,

        reason:
          req.body.reason,
      });

    return res.status(201).json({
      msg:
        "Submission delegated successfully.",

      delegation,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error delegating submission.",
    );
  }
}

async function bulkDelegateSubmissions(
  req,
  res,
) {
  try {
    const result =
      await delegationService.bulkDelegateSubmissions({
        submissionIds:
          req.body.submissionIds,

        assistantId:
          req.body.assistantId,

        delegatedById:
          req.user.id,

        reason:
          req.body.reason,
      });

    return res.status(200).json({
      msg:
        result.failed === 0
          ? "All selected submissions were delegated successfully."
          : "Bulk delegation completed with some failures.",

      result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error performing bulk delegation.",
    );
  }
}

async function reassignDelegation(
  req,
  res,
) {
  try {
    const delegation =
      await delegationService.reassignDelegation({
        delegationId:
          req.params.delegationId,

        assistantId:
          req.body.assistantId,

        changedById:
          req.user.id,

        reason:
          req.body.reason,
      });

    return res.json({
      msg:
        "Delegation reassigned successfully.",

      delegation,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error reassigning delegation.",
    );
  }
}

async function removeDelegation(
  req,
  res,
) {
  try {
    const result =
      await delegationService.removeDelegation({
        delegationId:
          req.params.delegationId,

        changedById:
          req.user.id,

        reason:
          req.body?.reason,
      });

    return res.json({
      msg:
        "Delegation removed successfully.",

      result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error removing delegation.",
    );
  }
}

async function getSubmissionDelegationHistory(
  req,
  res,
) {
  try {
    const result =
      await delegationService.getSubmissionDelegationHistory({
        submissionId:
          req.params.submissionId,
      });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching delegation history.",
    );
  }
}

async function getDelegationCounts(
  req,
  res,
) {
  try {
    const result =
      await delegationService.getDelegationCounts({
        assistantId:
          req.query.assistantId,

        from:
          req.query.from,

        to:
          req.query.to,
      });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching delegation counts.",
    );
  }
}

module.exports = {
  delegateSubmission,
  bulkDelegateSubmissions,
  reassignDelegation,
  removeDelegation,
  getSubmissionDelegationHistory,
  getDelegationCounts,
};