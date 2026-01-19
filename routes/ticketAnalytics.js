const express = require("express");
const Ticket = require("../models/Ticket");
const User = require("../models/User");

const router = express.Router();

/**
 * ADMIN – detailed assistants analytics
 */
router.get("/assistants", async (req, res) => {
  // 🔐 admin teacher only
  if (req.user.role !== "teacher" || req.user.assistantOf !== null) {
    return res.status(403).json({ message: "Admin only" });
  }

  // 1️⃣ get assistants of this teacher
  const assistants = await User.find({
    assistantOf: req.user._id,
  }).select("_id name email");

  // 2️⃣ build analytics per assistant
  const analytics = await Promise.all(
    assistants.map(async (assistant) => {
      const tickets = await Ticket.find({
        assignedTo: assistant._id,
      })
        .populate("createdBy", "name")
        .sort({ createdAt: -1 }); // 🔥 newest first

      const openTickets = tickets.filter(t => t.status !== "closed").length;
      const closedTickets = tickets.filter(t => t.status === "closed").length;

      return {
        assistant: {
          id: assistant._id,
          name: assistant.name,
          email: assistant.email,
        },
        summary: {
          total: tickets.length,
          open: openTickets,
          closed: closedTickets,
        },
        tickets: tickets.map(t => ({
          id: t._id,
          subject: t.subject,
          studentName: t.createdBy?.name || "—",
          status: t.status,
          createdAt: t.createdAt,
          closedAt: t.closedAt || null,
        })),
      };
    })
  );

  res.json(analytics);
});

module.exports = router;
