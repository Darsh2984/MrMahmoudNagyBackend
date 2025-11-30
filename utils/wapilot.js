// utils/wapilot.js
const axios = require("axios");

const WAPILOT_BASE_URL = "https://api.wapilot.net/api/v1";
const INSTANCE_ID = process.env.WAPILOT_INSTANCE_ID; 
const API_TOKEN = process.env.WAPILOT_API_TOKEN;

// -----------------------------------------
// 🔹 Safe Delay Function
// -----------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -----------------------------------------
// 🔹 WhatsApp Message Queue
// -----------------------------------------
let messageQueue = [];
let sending = false; // prevents double sending

// -----------------------------------------
// 🔹 Start Instance
// -----------------------------------------
async function startInstance() {
  const res = await axios.post(
    `${WAPILOT_BASE_URL}/instances/${INSTANCE_ID}/start`,
    { token: API_TOKEN },
    { headers: { "Content-Type": "application/json" } }
  );
  return res.data;
}

// -----------------------------------------
// 🔹 Get QR Code
// -----------------------------------------
async function getQRCode() {
  const res = await axios.get(
    `${WAPILOT_BASE_URL}/instances/${INSTANCE_ID}/qr-code`,
    {
      headers: { "Content-Type": "application/json" },
      data: { token: API_TOKEN }, 
    }
  );
  return res.data;
}

// -----------------------------------------
// 🔹 Safe sendMessage with Queue + Delay
// -----------------------------------------
async function sendMessage(chatId, text) {
  // Add job to queue
  messageQueue.push({ chatId, text });

  // If the queue is already processing, exit
  if (sending) return;

  sending = true;

  while (messageQueue.length > 0) {
    const { chatId, text } = messageQueue.shift();

    try {
      const res = await axios.post(
        `${WAPILOT_BASE_URL}/${INSTANCE_ID}/send-message`,
        {
          token: API_TOKEN,
          chat_id: chatId,
          text: text,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      console.log("✔ WhatsApp message sent:", text);

      // -----------------------------------------
      // 🛑 SAFE WHATSAPP DELAY (2 seconds)
      // Adjust to 2500–3000ms if sending many messages
      // -----------------------------------------
      await sleep(2000);

      return res.data;

    } catch (err) {
      console.error("❌ WhatsApp send error:", err.message);
      // continue to next queued message
    }
  }

  sending = false;
}

module.exports = {
  startInstance,
  getQRCode,
  sendMessage,
};
