const studentSupportChatService = require(
  "../services/studentSupportChat.service"
);

function sendError(res, error, fallback) {
  return res
    .status(error.status || 500)
    .json({
      msg:
        error.msg ||
        error.message ||
        fallback,
    });
}

async function listChats(req, res) {
  try {
    const chats =
      await studentSupportChatService
        .listChatsForUser(req.user);

    return res.json({
      chats,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't load support chats."
    );
  }
}

async function getMessages(req, res) {
  try {
    const result =
      await studentSupportChatService
        .getMessagesForUser({
          chatId: req.params.chatId,
          user: req.user,
          before: req.query.before,
          limit: req.query.limit,
        });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't load support chat messages."
    );
  }
}

async function sendMessage(req, res) {
  try {
    const message =
    await studentSupportChatService
    .sendMessageForUser({
        chatId: req.params.chatId,
        user: req.user,
        content: req.body.content,
        io: req.app.get("io"),
    });

    return res
      .status(201)
      .json({
        msg: "Message sent.",
        message,
      });
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't send the support chat message."
    );
  }
}

async function markRead(req, res) {
  try {
    const result =
      await studentSupportChatService
        .markReadForUser({
          chatId: req.params.chatId,
          user: req.user,
        });

    return res.json({
      msg: "Support chat marked as read.",
      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't update support chat read status."
    );
  }
}

module.exports = {
  listChats,
  getMessages,
  sendMessage,
  markRead,
};