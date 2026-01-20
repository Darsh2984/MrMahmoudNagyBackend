const mongoose = require("mongoose");
const ticketMessageSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    senderType: {
      type: String,
      enum: ["student", "assistant"],
      required: true,
    },

    // 🔹 Message type
    type: {
      type: String,
      enum: ["text", "image", "file", "audio"],
      default: "text",
    },

    // 🔹 Text message
    message: {
      type: String,
      default: "",
    },

    // 🔹 Attachment info
    fileUrl: String,
    fileName: String,
    fileMime: String,
    fileSize: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("TicketMessage", ticketMessageSchema);
