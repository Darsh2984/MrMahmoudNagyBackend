const express = require("express");
const Ticket = require("../models/Ticket");
const TicketCategory = require("../models/TicketCategory");
const TicketMessage = require("../models/TicketMessage");
const transporter = require("../config/nodemailer");
const User = require("../models/User");

const router = express.Router();

/**
 * round-robin assignment
 */
async function assignAssistant(category) {
  if (!category.assignedAssistants.length) return null;

  const next =
    (category.lastAssignedIndex + 1) % category.assignedAssistants.length;

  category.lastAssignedIndex = next;
  await category.save();

  return category.assignedAssistants[next];
}

/**
 * STUDENT – create ticket
 */
router.post("/", async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Students only" });
  }

  const { category: categoryId, subject, message } = req.body;

  const category = await TicketCategory.findById(categoryId).populate(
    "assignedAssistants"
  );

  const assistant = await assignAssistant(category);

  const ticket = await Ticket.create({
    createdBy: req.user._id,
    category: category._id,
    subject,
    assignedTo: assistant?._id || null,
    assignedAt: assistant ? new Date() : null,
  });

  await TicketMessage.create({
    ticket: ticket._id,
    sender: req.user._id,
    senderType: "student",
    message,
  });

  if (assistant?.email) {
    await transporter.sendMail({
      from: `"Mahmoud Nagy Support System" <${process.env.EMAIL_USER}>`,
      to: assistant.email,
      subject: "New Support Ticket Assigned",
      html: `<p>New ticket assigned: <b>${subject}</b></p>`,
    });
  }

  res.status(201).json(ticket);
});


/**
 * GET – teacher tickets
 * Admin → all tickets
 * Assistant → assigned tickets only
 */
router.get("/teacher", async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({ message: "Teachers only" });
  }

  const isAdmin = req.user.assistantOf === null;

  const query = isAdmin
    ? {} // ✅ admin sees everything
    : { assignedTo: req.user._id }; // ✅ assistant sees own

  const tickets = await Ticket.find(query)
    .populate("createdBy", "name")
    .populate("assignedTo", "name")
    .sort({ createdAt: -1 });

  res.json(tickets);
});



/**
 * GET – student tickets
 */
router.get("/my", async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Students only" });
  }

  const tickets = await Ticket.find({
    createdBy: req.user._id,
  })
    .populate("assignedTo", "name")
    .sort({ createdAt: -1 });

  res.json(tickets);
});




/**
 * GET – ticket details (student / assistant)
 */
router.get("/:id", async (req, res) => {
  const ticket = await Ticket.findById(req.params.id)
    .populate("category", "name")
    .populate("assignedTo", "name");

  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }

    console.log("DEBUG ASSISTANT CHECK", {
    userId: req.user._id,
    role: req.user.role,
    assistantOf: req.user.assistantOf,
    ticketAssignedTo: ticket.assignedTo,
  });
  // permissions
  const isStudent =
    req.user.role === "student" &&
    String(ticket.createdBy) === String(req.user._id);

  const isAssistant =
    req.user.role === "teacher" &&
    req.user.assistantOf !== null &&
    String(ticket.assignedTo._id) === String(req.user._id)
    
    const isAdmin = req.user.assistantOf === null;


  if (!isStudent && !isAssistant && !isAdmin) {
    return res.status(403).json({ message: "Access denied" });
  }

  res.json({
    ...ticket.toObject(),
    canClose: isAssistant && ticket.status !== "closed",
  });
});


/**
 * GET – ticket messages
 */
router.get("/:id/messages", async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  const isStudent =
    req.user.role === "student" &&
    String(ticket.createdBy) === String(req.user._id);

  const isAssistant =
    req.user.role === "teacher" &&
    req.user.assistantOf !== null &&
    String(ticket.assignedTo._id) === String(req.user._id)

      const isAdmin = req.user.assistantOf === null;


  if (!isStudent && !isAssistant && !isAdmin) {
    return res.status(403).json({ message: "Access denied" });
  }

  const messages = await TicketMessage.find({ ticket: ticket._id })
    .populate("sender", "name")
    .sort({ createdAt: 1 });

  res.json(messages);
});

/**
 * ASSISTANT – close ticket
 */
router.post("/:id/close", async (req, res) => {
  const isAssistant =
    req.user.role === "teacher" && req.user.assistantOf !== null;

  if (!isAssistant) {
    return res.status(403).json({ message: "Assistants only" });
  }

  const ticket = await Ticket.findById(req.params.id);

  if (String(ticket.assignedTo) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not your ticket" });
  }

  ticket.status = "closed";
  ticket.closedBy = req.user._id;
  ticket.closedAt = new Date();
  await ticket.save();

  res.json(ticket);
});

/**
 * POST – add message to ticket (student / assistant)
 * - Saves message
 * - Emits socket event
 * - Sends email ONLY if recipient is NOT active in chat
 */
router.post("/:id/messages", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message required" });
    }

    // 1️⃣ Load ticket (no populate needed here)
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // 2️⃣ Permission checks
    const isStudent =
      req.user.role === "student" &&
      String(ticket.createdBy) === String(req.user._id);

    const isAssistant =
      req.user.role === "teacher" &&
      req.user.assistantOf &&
      String(ticket.assignedTo) === String(req.user._id);

    const isAdmin = req.user.assistantOf === null;

      

    if (!isStudent && !isAssistant && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({ message: "Ticket is closed" });
    }

    // 3️⃣ Save message
    const newMessage = await TicketMessage.create({
      ticket: ticket._id,
      sender: req.user._id,
      senderType: isStudent ? "student" : "assistant",
      message: message.trim(),
    });

    // 4️⃣ Emit live socket message
    const io = req.app.get("io");
    io.to(ticket._id.toString()).emit("new-message", {
      _id: newMessage._id,
      ticket: ticket._id,
      sender: {
        _id: req.user._id,
        name: req.user.name,
      },
      senderType: newMessage.senderType,
      message: newMessage.message,
      createdAt: newMessage.createdAt,
    });

    // 5️⃣ Email notification logic (ONLY if recipient not active)
    const activeTicketUsers =
      req.app.get("activeTicketUsers").get(ticket._id.toString()) ||
      new Set();

    let recipient = null;

    // student → assistant
    if (isStudent && ticket.assignedTo) {
      recipient = await User.findById(ticket.assignedTo);
    }

    // assistant → student
    if (isAssistant) {
      recipient = await User.findById(ticket.createdBy);
    }

    if (
      recipient &&
      recipient.email &&
      !activeTicketUsers.has(recipient._id.toString())
    ) {
      await transporter.sendMail({
        from: `"Mahmoud Nagy Support System" <${process.env.EMAIL_USER}>`,
        to: recipient.email,
        subject: "New message on your support ticket",
        html: `
          <p>You have received a new message on your support ticket.</p>
          <p><b>Ticket:</b> ${ticket.subject}</p>
          <p>Please log in to view the reply.</p>
        `,
      });
    }

    // 6️⃣ Respond
    res.status(201).json(newMessage);
  } catch (err) {
    console.error("❌ Ticket message error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});









module.exports = router;
