const ticketMessageService = require(
  "../services/ticketMessage.service"
);

async function sendMessage(req, res) {
  try {
    const message =
      await ticketMessageService.sendMessage({
        ticketId: req.params.ticketId,
        sender: req.user,

        content: req.body.content,
        file: req.file,

        requestedMessageType:
          req.body.messageType,

        audioDuration:
          req.body.audioDuration,

        io: req.app.get("io"),
      });

    res.status(201).json({
      msg: "Message sent",
      message,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      msg:
        err.msg ||
        err.message ||
        "Error sending message",
    });
  }
}

module.exports = {
  sendMessage,
};