const groupChatService = require(
  "../services/groupChat.service",
);

function sendError(
  res,
  error,
  fallback,
) {
  return res
    .status(error.status || 500)
    .json({
      msg:
        error.msg ||
        error.message ||
        fallback,
    });
}

async function listChats(
  req,
  res,
) {
  try {
    const chats =
      await groupChatService
        .listChatsForUser(
          req.user,
        );

    return res.json({
      chats,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't load group chats.",
    );
  }
}

async function getMessages(
  req,
  res,
) {
  try {
    const result =
      await groupChatService
        .getMessages({
          groupId:
            req.params.groupId,

          user: req.user,

          before:
            req.query.before,

          limit:
            req.query.limit,
        });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't load chat messages.",
    );
  }
}

async function sendMessage(
  req,
  res,
) {
  try {
    const message =
      await groupChatService
        .sendMessage({
          groupId:
            req.params.groupId,

          sender:
            req.user,

          content:
            req.body.content,

          file:
            req.file,

          requestedMessageType:
            req.body.messageType,

          audioDuration:
            req.body.audioDuration,

          io:
            req.app.get("io"),
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
      "Couldn't send the message.",
    );
  }
}

async function markRead(
  req,
  res,
) {
  try {
    const result =
      await groupChatService
        .markChatRead({
          groupId:
            req.params.groupId,

          user: req.user,
        });

    return res.json({
      msg:
        "Chat marked as read.",

      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't update chat read status.",
    );
  }
}

module.exports = {
  listChats,
  getMessages,
  sendMessage,
  markRead,
};