// utils/wapilot.js
const axios = require("axios");

const WAPILOT_BASE_URL = "https://api.wapilot.net/api/v1";
const INSTANCE_ID = process.env.WAPILOT_INSTANCE_ID; 
const API_TOKEN = process.env.WAPILOT_API_TOKEN;


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
  const res = await axios.post(
    `${WAPILOT_BASE_URL}/${INSTANCE_ID}/send-message`,
    {
      token: API_TOKEN,
      chat_id: chatId,
      text: text,
    },
    { headers: { "Content-Type": "application/json" } }
  );
  return res.data;
  }

module.exports = {
  startInstance,
  getQRCode,
  sendMessage,
};
