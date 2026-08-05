const express = require("express");

const router = express.Router();

const groupChatController =
  require(
    "../controllers/groupChat.controller",
  );

const {
  requireAuth,
} = require(
  "../middleware/rbac.middleware",
);

const {
  uploadGroupChatAttachment,
} = require(
  "../middleware/groupChatUpload.middleware",
);

router.use(requireAuth);

router.get(
  "/",
  groupChatController.listChats,
);

router.get(
  "/:groupId/messages",
  groupChatController.getMessages,
);

router.post(
  "/:groupId/messages",
  uploadGroupChatAttachment,
  groupChatController.sendMessage,
);

router.patch(
  "/:groupId/read",
  groupChatController.markRead,
);

module.exports = router;