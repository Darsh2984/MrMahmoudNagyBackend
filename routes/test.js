const express = require("express");
const router = express.Router();
const { startInstance, getQRCode, sendMessage } = require("../utils/wapilot");

// 🔹 Test Start Instance
router.post("/test-whatsapp/start", async (req, res) => {
  try {
    const data = await startInstance();
    res.json({ msg: "✅ Instance started", data });
  } catch (err) {
    console.error("❌ Failed to start instance:", err.response?.data || err.message);
    res.status(500).json({ error: "❌ Failed to start instance" });
  }
});

// 🔹 Test Get QR Code
router.get("/test-whatsapp/qr", async (req, res) => {
  try {
    const data = await getQRCode();
    res.json({ msg: "✅ QR code fetched", data });
  } catch (err) {
    console.error("❌ Failed to get QR code:", err.response?.data || err.message);
    res.status(500).json({ error: "❌ Failed to get QR code" });
  }
});

// 🔹 Test Send Message
router.post("/test-whatsapp/send", async (req, res) => {
  try {
    const { chatId, text } = req.body; // ✅ changed "message" → "text"
    if (!chatId || !text) {
      return res.status(400).json({ error: "⚠️ chatId and text are required" });
    }

    const data = await sendMessage(chatId, text); // ✅ keep consistent
    res.json({ msg: "✅ Message sent", data });
  } catch (err) {
    console.error("❌ Failed to send message:", err.response?.data || err.message);
    res.status(500).json({ error: "❌ Failed to send message" });
  }
});

module.exports = router;
