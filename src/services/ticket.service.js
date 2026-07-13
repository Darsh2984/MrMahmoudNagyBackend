const prisma = require("../config/prisma");
const { getAssignedAssistantForStudent } = require("./assistantAssignment.service");
const { notify } = require("./notification.service");

/**
 * Only the ticket's creator, its assigned assistant, or a Teacher/Head may see or act
 * on a ticket — these contain private student conversations. Every read/write below
 * that touches a specific ticket goes through this check.
 */
function assertTicketAccess(ticket, user) {
  const isAdmin = user.role === "TEACHER" || (user.role === "ASSISTANT" && user.isHeadAssistant);
  const isCreator = ticket.createdById === user.id;
  const isAssignedAssistant = ticket.assignedAssistantId === user.id;
  if (!isAdmin && !isCreator && !isAssignedAssistant) {
    throw { status: 403, msg: "You don't have access to this ticket" };
  }
}

/** Student creates a ticket — auto-routed to their group's assigned assistant, per spec req #5. */
async function createTicket({ createdById, categoryId, subject, firstMessage }) {
  const category = await prisma.ticketCategory.findUnique({ where: { id: categoryId } });
  if (!category) throw { status: 404, msg: "Category not found" };

  const assignedAssistant = await getAssignedAssistantForStudent(createdById);

  const ticket = await prisma.ticket.create({
    data: {
      createdById,
      categoryId,
      subject,
      assignedAssistantId: assignedAssistant?.id || null,
      messages: firstMessage
        ? { create: { senderId: createdById, senderType: "STUDENT", content: firstMessage } }
        : undefined,
    },
    include: { messages: true },
  });

  return ticket;
}

async function listTicketsForStudent(studentId) {
  return prisma.ticket.findMany({
    where: { createdById: studentId },
    orderBy: { updatedAt: "desc" },
    include: { category: true },
  });
}

async function listTicketsForAssistant(assistantId) {
  return prisma.ticket.findMany({
    where: { assignedAssistantId: assistantId },
    orderBy: { updatedAt: "desc" },
    include: { category: true, createdBy: { select: { id: true, name: true } } },
  });
}

async function getTicketWithMessages(ticketId, user) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      category: true,
      createdBy: { select: { id: true, name: true } },
      assignedAssistant: { select: { id: true, name: true } },
    },
  });
  if (!ticket) throw { status: 404, msg: "Ticket not found" };
  assertTicketAccess(ticket, user);
  return ticket;
}

/** Assistant marks a ticket resolved — this puts it in "pending student confirmation" state. */
async function markResolvedPendingConfirmation(ticketId, user) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw { status: 404, msg: "Ticket not found" };
  assertTicketAccess(ticket, user);

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: "RESOLVED_PENDING_CONFIRM" },
  });

  notify({
    userId: ticket.createdById,
    type: "TICKET_RESOLVED",
    title: "Your ticket was marked resolved",
    body: "Please confirm whether this actually solved your issue",
    link: `/tickets/${ticketId}`,
  }).catch((err) => console.error("notify() failed:", err.message));

  return updated;
}

/**
 * Student answers "was this actually solved?" — per spec req #6. If not, the ticket
 * reopens rather than staying falsely marked resolved.
 */
async function confirmResolution(ticketId, studentId, resolved) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw { status: 404, msg: "Ticket not found" };
  if (ticket.createdById !== studentId) {
    throw { status: 403, msg: "Only the student who created this ticket can confirm resolution" };
  }

  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      studentConfirmedResolved: resolved,
      status: resolved ? "CONFIRMED_RESOLVED" : "REOPENED",
    },
  });
}

module.exports = {
  createTicket,
  listTicketsForStudent,
  listTicketsForAssistant,
  getTicketWithMessages,
  markResolvedPendingConfirmation,
  confirmResolution,
  assertTicketAccess,
};
