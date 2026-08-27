const parentAccessService = require(
  "../services/parentAccess.service"
);

function getAccessCode(req) {
  return (
    req.body?.accessCode ||
    req.query?.accessCode ||
    req.headers["x-parent-access-code"]
  );
}

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

async function lookup(req, res) {
  try {
    const result =
      await parentAccessService.lookup(
        getAccessCode(req)
      );

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't load parent access."
    );
  }
}

async function listChats(req, res) {
  try {
    const result =
      await parentAccessService.listChats(
        getAccessCode(req)
      );

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't load parent support chats."
    );
  }
}

async function getMessages(req, res) {
  try {
    const result =
      await parentAccessService.getMessages({
        accessCode: getAccessCode(req),
        chatId: req.params.chatId,
        before: req.query.before,
        limit: req.query.limit,
      });

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't load parent support chat messages."
    );
  }
}

async function sendMessage(req, res) {
  try {
    const message =
    await parentAccessService.sendMessage({
        accessCode: getAccessCode(req),
        chatId: req.params.chatId,
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
      "Couldn't send parent support chat message."
    );
  }
}

async function markRead(req, res) {
  try {
    const result =
      await parentAccessService.markRead({
        accessCode: getAccessCode(req),
        chatId: req.params.chatId,
      });

    return res.json({
      msg: "Support chat marked as read.",
      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Couldn't update parent support chat read status."
    );
  }
}

module.exports = {
  lookup,
  listChats,
  getMessages,
  sendMessage,
  markRead,
};