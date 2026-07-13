const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticket.controller");
const ticketMessageController = require("../controllers/ticketMessage.controller");
const { requireAuth, requireRole, requireAssistantPermission } = require("../middleware/rbac.middleware");

// Student creates a ticket — auto-routed to their group's assistant (req #5)
router.post("/", requireRole("STUDENT"), ticketController.createTicket);

router.get("/mine", requireRole("STUDENT"), ticketController.listMyTickets);
router.get("/assigned-to-me", requireAssistantPermission("canManageTickets"), ticketController.listAssignedToMe);
router.get("/:ticketId", requireAuth, ticketController.getTicket);

router.post("/:ticketId/messages", requireAuth, ticketMessageController.sendMessage);

// Assistant marks resolved -> pending student confirmation
router.patch("/:ticketId/resolve", requireAssistantPermission("canManageTickets"), ticketController.markResolved);

// Student answers "was this actually solved?"
router.patch("/:ticketId/confirm", requireRole("STUDENT"), ticketController.confirmResolution);

module.exports = router;
