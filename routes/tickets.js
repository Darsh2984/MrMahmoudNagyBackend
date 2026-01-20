const express = require("express");
const Ticket = require("../models/Ticket");
const TicketCategory = require("../models/TicketCategory");
const TicketMessage = require("../models/TicketMessage");
const transporter = require("../config/nodemailer");
const User = require("../models/User");
const { sendMessage } = require("../utils/wapilot");
const { ticketUpload } = require("../middleware/ticketUpload");


const axios = require("axios");

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com";
const BUNNY_CDN_HOST = "https://layth-eg.b-cdn.net"; // your CDN hostname


const router = express.Router();

/**
 * 🔁 Round-robin assistant assignment
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
 * ===============================
 * STUDENT – Create Ticket
 * ===============================
 */
router.post("/", async (req, res) => {
  try {
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

    /* 📧 Email notification */
    if (assistant?.email) {
      await transporter.sendMail({
        from: `"Mahmoud Nagy Support System" <${process.env.EMAIL_USER}>`,
        to: assistant.email,
        subject: "New Support Ticket Assigned",
        html: `<p>New ticket assigned: <b>${subject}</b></p>`,
      });
    }

    /* 📲 WhatsApp notification (ONLY if assistant offline) */
    if (assistant?.teacherPhoneNum) {
      const activeUsers =
        req.app.get("activeTicketUsers").get(ticket._id.toString()) ||
        new Set();

      const assistantOnline = activeUsers.has(
        assistant._id.toString()
      );

      if (!assistantOnline) {
        await sendMessage(
          `${assistant.teacherPhoneNum}@c.us`,
          `🆕 *New Support Ticket Assigned*\n\n📌 Subject: ${subject}\n👨‍🎓 Student: ${req.user.name}\n\nPlease check the system.`
        );
      }
    }

    res.status(201).json(ticket);
  } catch (err) {
    console.error("❌ Create ticket error:", err);
    res.status(500).json({ message: "Failed to create ticket" });
  }
});

/**
 * ===============================
 * GET – Teacher Tickets
 * Admin → all
 * Assistant → assigned only
 * ===============================
 */
router.get("/teacher", async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({ message: "Teachers only" });
  }

  const isAdmin = req.user.assistantOf === null;

  const query = isAdmin ? {} : { assignedTo: req.user._id };

  const tickets = await Ticket.find(query)
    .populate("createdBy", "name")
    .populate("assignedTo", "name")
    .sort({ createdAt: -1 });

  res.json(tickets);
});

/**
 * ===============================
 * GET – Student Tickets
 * ===============================
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
 * ===============================
 * GET – Ticket Details
 * ===============================
 */
router.get("/:id", async (req, res) => {
  const ticket = await Ticket.findById(req.params.id)
    .populate("category", "name")
    .populate("assignedTo", "name");

  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }

  const isStudent =
    req.user.role === "student" &&
    String(ticket.createdBy) === String(req.user._id);

  const isAssistant =
    req.user.role === "teacher" &&
    req.user.assistantOf &&
    String(ticket.assignedTo?._id) === String(req.user._id);

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
 * ===============================
 * GET – Ticket Messages
 * ===============================
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
    req.user.assistantOf &&
    String(ticket.assignedTo) === String(req.user._id);

  const isAdmin = req.user.assistantOf === null;

  if (!isStudent && !isAssistant && !isAdmin) {
    return res.status(403).json({ message: "Access denied" });
  }

  const messages = await TicketMessage.find({
    ticket: ticket._id,
  })
    .populate("sender", "name")
    .sort({ createdAt: 1 });

  res.json(messages);
});

/**
 * ===============================
 * ASSISTANT – Close Ticket
 * ===============================
 */
router.post("/:id/close", async (req, res) => {
  if (req.user.role !== "teacher" || !req.user.assistantOf) {
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
 * ===============================
 * POST – Add Message (Student / Assistant / Admin)
 * ===============================
 */
router.post("/:id/messages", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ message: "Message required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

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

    const newMessage = await TicketMessage.create({
      ticket: ticket._id,
      sender: req.user._id,
      senderType: isStudent ? "student" : "assistant",
      message: message.trim(),
    });

    /* 🔴 Socket emit */
    const io = req.app.get("io");
    io.to(ticket._id.toString()).emit("new-message", {
      _id: newMessage._id,
      sender: { _id: req.user._id, name: req.user.name },
      senderType: newMessage.senderType,
      message: newMessage.message,
      createdAt: newMessage.createdAt,
    });

    /* 🔔 Offline notifications */
    const activeUsers =
      req.app.get("activeTicketUsers").get(ticket._id.toString()) ||
      new Set();

    let recipient = null;

    if (isStudent && ticket.assignedTo) {
      recipient = await User.findById(ticket.assignedTo);
    }

    if (isAssistant) {
      recipient = await User.findById(ticket.createdBy);
    }

    if (recipient && !activeUsers.has(recipient._id.toString())) {
      /* Email */
      if (recipient.email) {
        await transporter.sendMail({
          from: `"Mahmoud Nagy Support System" <${process.env.EMAIL_USER}>`,
          to: recipient.email,
          subject: "New message on your support ticket",
          html: `<p><b>${ticket.subject}</b><br/>${message}</p>`,
        });
      }

      /* WhatsApp */
      const phone =
        recipient.role === "teacher"
          ? recipient.teacherPhoneNum
          : recipient.studentPhone;

      if (phone) {
        await sendMessage(
          `${phone}@c.us`,
          `💬 *New Message on Support Ticket*\n\n📌 ${ticket.subject}\n\n${message} \n\n Please check the system and respond there.`
        );
      }
    }

    res.status(201).json(newMessage);
  } catch (err) {
    console.error("❌ Ticket message error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});


/**
 * POST – upload attachment to ticket
 * Supports images, pdfs, documents, audio
 */
router.post("/:id/upload",ticketUpload.single("file"),async (req, res) => {
    try {
      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // 🔐 Permission checks
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

      if (!req.file) {
        return res.status(400).json({ message: "File is required" });
      }

      // 🧠 Detect message type
      let type = "file";
      if (req.file.mimetype.startsWith("image/")) type = "image";
      if (req.file.mimetype.startsWith("audio/")) type = "audio";

      // 🟦 Bunny upload
      const fileName = `${Date.now()}-${req.file.originalname}`;
      const path = `tickets/${ticket._id}/${fileName}`;
      const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

      await axios.put(uploadUrl, req.file.buffer, {
        headers: {
          AccessKey: BUNNY_ACCESS_KEY,
          "Content-Type": "application/octet-stream",
        },
        maxBodyLength: Infinity,
      });

      const cdnUrl = `${BUNNY_CDN_HOST}/${path}`;

      // 💾 Save message
      const newMessage = await TicketMessage.create({
        ticket: ticket._id,
        sender: req.user._id,
        senderType: isStudent ? "student" : "assistant",
        type,
        fileUrl: cdnUrl,
        fileName: req.file.originalname,
        fileMime: req.file.mimetype,
        fileSize: req.file.size,
      });

      // 🔴 Emit live socket message
      const io = req.app.get("io");
      io.to(ticket._id.toString()).emit("new-message", {
        _id: newMessage._id,
        type: newMessage.type,
        fileUrl: newMessage.fileUrl,
        fileName: newMessage.fileName,
        sender: {
          _id: req.user._id,
          name: req.user.name,
        },
        senderType: newMessage.senderType,
        createdAt: newMessage.createdAt,
      });

      res.status(201).json(newMessage);
    } catch (err) {
      console.error("❌ Ticket upload error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

module.exports = router;
