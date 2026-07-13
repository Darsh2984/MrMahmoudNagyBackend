const axios = require("axios");

/**
 * Abstraction over "send a message to a phone number on some external chat platform."
 * Today this is WhatsApp via Wapilot. Mr. Nagy is considering switching to Telegram
 * (Wapilot/WhatsApp risks account bans; Telegram doesn't have this issue) — when/if
 * that happens, this is the ONLY file that needs to change. Nothing else in the
 * codebase should ever import axios or know about Wapilot directly; everything calls
 * `sendExternalMessage(phone, text)` from here.
 */

const WAPILOT_BASE_URL = "https://api.wapilot.net/api/v1";
const INSTANCE_ID = process.env.WAPILOT_INSTANCE_ID;
const API_TOKEN = process.env.WAPILOT_API_TOKEN;

async function sendExternalMessage(phone, text) {
  if (!phone) return null; // silently no-op if we don't have a number on file
  try {
    const chatId = `${phone}@c.us`;
    const res = await axios.post(
      `${WAPILOT_BASE_URL}/${INSTANCE_ID}/send-message`,
      { token: API_TOKEN, chat_id: chatId, text },
      { headers: { "Content-Type": "application/json" } }
    );
    return res.data;
  } catch (err) {
    // Never let a messaging failure break the feature that triggered it (e.g. grading
    // a quiz shouldn't fail just because WhatsApp/Wapilot is down or rate-limited).
    console.error("sendExternalMessage failed:", err.response?.data || err.message);
    return null;
  }
}

module.exports = { sendExternalMessage };
