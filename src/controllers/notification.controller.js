const notificationService = require("../services/notification.service");

async function listMine(req, res) {
  try {
    const notifications = await notificationService.listForUser(req.user.id, req.query);
    res.json(notifications);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching notifications" });
  }
}

async function markRead(req, res) {
  try {
    const notification = await notificationService.markRead(req.params.notificationId, req.user.id);
    res.json({ msg: "Marked as read", notification });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating notification" });
  }
}

async function markAllRead(req, res) {
  try {
    await notificationService.markAllRead(req.user.id);
    res.json({ msg: "All notifications marked as read" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating notifications" });
  }
}

async function registerPushToken(req, res) {
  try {
    const token = await notificationService.registerPushToken({
      userId: req.user.id,
      expoToken: req.body.expoToken,
      platform: req.body.platform,
    });
    res.json({ msg: "Push token registered", token });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error registering push token" });
  }
}

module.exports = { listMine, markRead, markAllRead, registerPushToken };
