const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const { requireAuth } = require("../middleware/rbac.middleware");

router.get("/mine", requireAuth, notificationController.listMine);
router.patch("/:notificationId/read", requireAuth, notificationController.markRead);
router.patch("/read-all", requireAuth, notificationController.markAllRead);
router.post("/push-token", requireAuth, notificationController.registerPushToken);

module.exports = router;
