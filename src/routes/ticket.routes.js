const express = require("express");

const router = express.Router();

const ticketController = require(
  "../controllers/ticket.controller"
);

const ticketMessageController = require(
  "../controllers/ticketMessage.controller"
);

const {
  requireAuth,
  requireRole,
  requireAssistantPermission,
  requireAdminLevel,
} = require("../middleware/rbac.middleware");

const {
  uploadTicketMessageAttachment,
} = require(
  "../middleware/ticketMessageUpload.middleware"
);

// Student creates a ticket.
router.post(
  "/",
  requireRole("STUDENT"),
  ticketController.createTicket
);

router.get(
  "/mine",
  requireRole("STUDENT"),
  ticketController.listMyTickets
);

router.get(
  "/assigned-to-me",
  requireAssistantPermission("canManageTickets"),
  ticketController.listAssignedToMe
);

// Teacher and Head Assistant oversight.
router.get(
  "/all",
  requireAdminLevel,
  ticketController.getAllTickets
);

router.get(
  "/:ticketId",
  requireAuth,
  ticketController.getTicket
);

// Text, image, PDF, video and audio messages.
router.post(
  "/:ticketId/messages",
  requireAuth,
  uploadTicketMessageAttachment,
  ticketMessageController.sendMessage
);

router.patch(
  "/:ticketId/resolve",
  requireAssistantPermission("canManageTickets"),
  ticketController.markResolved
);

router.patch(
  "/:ticketId/confirm",
  requireRole("STUDENT"),
  ticketController.confirmResolution
);

module.exports = router;