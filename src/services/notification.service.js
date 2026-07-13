const prisma = require("../config/prisma");
const push = require("./push.service");

/**
 * Single entry point for the rest of the codebase: call this whenever something
 * notification-worthy happens (grade posted, ticket reply, report ready, etc.).
 * Creates the in-app Notification row AND fires a push in parallel — callers never
 * need to know push exists.
 */
async function notify({ userId, type, title, body, link }) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, link },
  });

  // Fire-and-forget — a push failure should never break the calling feature (e.g.
  // grading a submission shouldn't fail just because a push token is stale).
  push.sendPushToUser(userId, { title, body, data: { link, type } }).catch((err) => {
    console.error("notify(): push failed, in-app notification still saved:", err.message);
  });

  return notification;
}

async function listForUser(userId, { unreadOnly } = {}) {
  return prisma.notification.findMany({
    where: { userId, ...(unreadOnly === "true" ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

async function markRead(notificationId, userId) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    throw { status: 404, msg: "Notification not found" };
  }
  return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
}

async function markAllRead(userId) {
  return prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

async function registerPushToken({ userId, expoToken, platform }) {
  return prisma.pushToken.upsert({
    where: { expoToken },
    update: { userId, platform },
    create: { userId, expoToken, platform },
  });
}

module.exports = { notify, listForUser, markRead, markAllRead, registerPushToken };
