const prisma = require("../config/prisma");

/**
 * Per-assistant ticket stats, per spec req #6:
 *   - opened: how many tickets were routed to this assistant
 *   - replied: how many of those they've sent at least one message on
 *   - resolvedConfirmed: student confirmed the issue was actually solved
 *   - reopened: student said it was NOT actually solved
 *   - pendingConfirmation: assistant marked resolved, student hasn't answered yet
 *   - stillOpen: never marked resolved at all
 */
async function getAssistantStats(assistantId, { from, to } = {}) {
  const dateFilter =
    from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {};

  const tickets = await prisma.ticket.findMany({
    where: { assignedAssistantId: assistantId, ...dateFilter },
    select: { id: true, status: true },
  });

  const ticketIds = tickets.map((t) => t.id);

  const repliedTicketIds = await prisma.ticketMessage.findMany({
    where: { ticketId: { in: ticketIds }, senderId: assistantId, senderType: "ASSISTANT" },
    distinct: ["ticketId"],
    select: { ticketId: true },
  });

  const counts = {
    opened: tickets.length,
    replied: repliedTicketIds.length,
    resolvedConfirmed: tickets.filter((t) => t.status === "CONFIRMED_RESOLVED").length,
    reopened: tickets.filter((t) => t.status === "REOPENED").length,
    pendingConfirmation: tickets.filter((t) => t.status === "RESOLVED_PENDING_CONFIRM").length,
    stillOpen: tickets.filter((t) => t.status === "OPEN").length,
  };

  return counts;
}

/** All assistants at once — for a Teacher/Head overview dashboard. */
async function getAllAssistantStats({ from, to } = {}) {
  const assistants = await prisma.user.findMany({
    where: { role: "ASSISTANT" },
    select: { id: true, name: true, isHeadAssistant: true },
  });

  const results = [];
  for (const assistant of assistants) {
    const stats = await getAssistantStats(assistant.id, { from, to });
    results.push({ assistantId: assistant.id, assistantName: assistant.name, isHeadAssistant: assistant.isHeadAssistant, ...stats });
  }
  return results;
}

module.exports = { getAssistantStats, getAllAssistantStats };
