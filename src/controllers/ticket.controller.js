const ticketService = require("../services/ticket.service");

async function createTicket(req, res) {
  try {
    const ticket = await ticketService.createTicket({
      createdById: req.user.id,
      categoryId: req.body.categoryId,
      subject: req.body.subject,
      firstMessage: req.body.firstMessage,
    });
    res.json({ msg: "Ticket created", ticket });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating ticket" });
  }
}

async function listMyTickets(req, res) {
  try {
    const tickets = await ticketService.listTicketsForStudent(req.user.id);
    res.json(tickets);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing tickets" });
  }
}

async function listAssignedToMe(req, res) {
  try {
    const tickets = await ticketService.listTicketsForAssistant(req.user.id);
    res.json(tickets);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing assigned tickets" });
  }
}

async function getTicket(req, res) {
  try {
    const ticket = await ticketService.getTicketWithMessages(req.params.ticketId, req.user);
    res.json(ticket);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching ticket" });
  }
}

async function markResolved(req, res) {
  try {
    const ticket = await ticketService.markResolvedPendingConfirmation(req.params.ticketId, req.user);
    res.json({ msg: "Ticket marked resolved, awaiting student confirmation", ticket });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating ticket" });
  }
}

async function confirmResolution(req, res) {
  try {
    const ticket = await ticketService.confirmResolution(req.params.ticketId, req.user.id, req.body.resolved);
    res.json({ msg: "Confirmation recorded", ticket });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error confirming resolution" });
  }
}

async function getAllTickets(req, res) {
  try {
    const tickets = await ticketService.listAllTickets();
    res.json(tickets);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing all tickets" });
  }
}

module.exports = { createTicket, listMyTickets, listAssignedToMe, getAllTickets, getTicket, markResolved, confirmResolution };
