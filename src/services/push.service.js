const { Expo } = require("expo-server-sdk");
const prisma = require("../config/prisma");

const expo = new Expo();

/**
 * Sends a push notification to every device token a user has registered.
 * Silently no-ops if the user has no tokens (e.g. hasn't installed the mobile app,
 * or is only using the web version) — push is an enhancement, never a requirement.
 */
async function sendPushToUser(userId, { title, body, data = {} }) {
  const tokens = await prisma.pushToken.findMany({ where: { userId } });
  if (tokens.length === 0) return;

  const messages = [];
  for (const t of tokens) {
    if (!Expo.isExpoPushToken(t.expoToken)) continue; // skip malformed/stale tokens
    messages.push({ to: t.expoToken, sound: "default", title, body, data });
  }
  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      await cleanupDeadTokens(chunk, receipts);
    } catch (err) {
      console.error("Push send error:", err.message);
    }
  }
}

/** Removes tokens Expo reports as no longer valid (app uninstalled, etc.) */
async function cleanupDeadTokens(sentChunk, receipts) {
  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
      const deadToken = sentChunk[i].to;
      await prisma.pushToken.deleteMany({ where: { expoToken: deadToken } }).catch(() => {});
    }
  }
}

module.exports = { sendPushToUser };
