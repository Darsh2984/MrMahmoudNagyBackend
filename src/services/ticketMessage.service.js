const prisma = require("../config/prisma");
const { assertTicketAccess } = require("./ticket.service");

/**
 * `io` is passed in from the controller (via req.app.get("io")) rather than required
 * directly here, so this service stays testable without a real socket server.
 */
async function sendMessage({ ticketId, sender, content, io }) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw { status: 404, msg: "Ticket not found" };
  assertTicketAccess(ticket, sender);

  const senderType = sender.role === "STUDENT" ? "STUDENT" : "ASSISTANT";

  const message = await prisma.ticketMessage.create({
    data: { ticketId, senderId: sender.id, senderType, content },
  });

  // Keep the ticket's updatedAt fresh so "most recently active" sorting works.
  await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });

  if (io) {
    io.to(ticketId).emit("new-ticket-message", message);
  }

  return message;
}

module.exports = { sendMessage };
