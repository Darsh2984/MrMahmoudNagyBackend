const express = require("express");

const router = express.Router();

const parentAccessController =
  require("../controllers/parentAccess.controller");

router.post(
  "/lookup",
  parentAccessController.lookup
);

router.post(
  "/chats",
  parentAccessController.listChats
);

router.post(
  "/chats/:chatId/messages",
  parentAccessController.getMessages
);

router.post(
  "/chats/:chatId/messages/send",
  parentAccessController.sendMessage
);

router.post(
  "/chats/:chatId/read",
  parentAccessController.markRead
);

module.exports = router;