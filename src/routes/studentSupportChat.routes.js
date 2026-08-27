const express = require("express");

const router = express.Router();

const studentSupportChatController =
  require("../controllers/studentSupportChat.controller");

const {
  requireAuth,
} = require("../middleware/rbac.middleware");

router.use(requireAuth);

router.get(
  "/",
  studentSupportChatController.listChats
);

router.get(
  "/:chatId/messages",
  studentSupportChatController.getMessages
);

router.post(
  "/:chatId/messages",
  studentSupportChatController.sendMessage
);

router.patch(
  "/:chatId/read",
  studentSupportChatController.markRead
);

module.exports = router;