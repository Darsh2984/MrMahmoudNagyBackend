const delegationService = require("../services/delegation.service");

async function delegateSubmission(req, res) {
  try {
    const delegation = await delegationService.delegateSubmission({
      submissionId: req.body.submissionId,
      assistantId: req.body.assistantId,
      delegatedById: req.user.id,
    });
    res.json({ msg: "Submission delegated", delegation });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error delegating submission" });
  }
}

async function gradeDelegatedSubmission(req, res) {
  try {
    const delegation = await delegationService.gradeDelegatedSubmission({
      delegationId: req.params.delegationId,
      grade: req.body.grade,
      comments: req.body.comments,
      correctedFile: req.file,
    });
    res.json({ msg: "Delegated submission graded", delegation });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error grading delegated submission" });
  }
}

/** Returns delegation counts, optionally filtered by assistant and date range. Counts only — no pay figures. */
async function getDelegationCounts(req, res) {
  try {
    const { assistantId, from, to } = req.query;
    const counts = await delegationService.getDelegationCounts({ assistantId, from, to });
    res.json(counts);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching delegation counts" });
  }
}

module.exports = { delegateSubmission, gradeDelegatedSubmission, getDelegationCounts };
