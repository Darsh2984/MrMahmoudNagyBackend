const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");

/**
 * Teacher/Head delegates a submitted homework paper to a specific assistant for grading.
 * This ONLY tracks who-was-assigned-what-and-when — it does not compute pay/salary in any
 * way. Mr. Nagy uses the counts this produces (via listDelegationsForAssistant) to work out
 * compensation himself, entirely outside this system.
 */
async function delegateSubmission({ submissionId, assistantId, delegatedById }) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) throw { status: 404, msg: "Submission not found" };

  const assistant = await prisma.user.findUnique({ where: { id: assistantId } });
  if (!assistant || assistant.role !== "ASSISTANT") {
    throw { status: 400, msg: "assistantId must reference an ASSISTANT" };
  }

  const existing = await prisma.delegation.findUnique({ where: { submissionId } });
  if (existing) throw { status: 400, msg: "This submission is already delegated" };

  return prisma.delegation.create({ data: { submissionId, assistantId, delegatedById } });
}

/** Assistant grades a submission that was delegated to them. */
async function gradeDelegatedSubmission({ delegationId, grade, comments, correctedFile }) {
  const delegation = await prisma.delegation.findUnique({ where: { id: delegationId } });
  if (!delegation) throw { status: 404, msg: "Delegation not found" };

  let correctedFileUrl;
  if (correctedFile) {
    correctedFileUrl = await storage.uploadBuffer(
      correctedFile.buffer,
      correctedFile.originalname,
      correctedFile.mimetype,
      "corrected"
    );
  }

  const gradedSubmission = await prisma.submission.update({
    where: { id: delegation.submissionId },
    data: { grade, comments, correctedFileUrl, gradedAt: new Date() },
  });

  const result = await prisma.delegation.update({
    where: { id: delegationId },
    data: { completedAt: new Date() },
  });

  notify({
    userId: gradedSubmission.studentId,
    type: "GRADE_POSTED",
    title: "Your homework was graded",
    body: `You scored ${grade}`,
    link: `/submissions/${delegation.submissionId}`,
  }).catch((err) => console.error("notify() failed:", err.message));

  return result;
}

/**
 * Counts of delegated papers per assistant within a date range — for Mr. Nagy to use
 * however he wants externally (e.g. as a basis for pay). We only ever return counts and
 * timestamps here, never any monetary figure.
 */
async function getDelegationCounts({ assistantId, from, to }) {
  const where = {
    ...(assistantId ? { assistantId } : {}),
    ...(from || to
      ? { delegatedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };

  const delegations = await prisma.delegation.findMany({
    where,
    include: { assistant: { select: { id: true, name: true } } },
    orderBy: { delegatedAt: "asc" },
  });

  // Group by assistant for a simple per-assistant total, plus how many are completed vs pending.
  const byAssistant = {};
  for (const d of delegations) {
    const key = d.assistantId;
    if (!byAssistant[key]) {
      byAssistant[key] = { assistantId: key, assistantName: d.assistant.name, totalDelegated: 0, completed: 0, pending: 0 };
    }
    byAssistant[key].totalDelegated += 1;
    if (d.completedAt) byAssistant[key].completed += 1;
    else byAssistant[key].pending += 1;
  }

  return Object.values(byAssistant);
}

module.exports = { delegateSubmission, gradeDelegatedSubmission, getDelegationCounts };
