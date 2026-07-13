const ticketMessageService = require("../services/ticketMessage.service");

async function sendMessage(req, res) {
  try {
    const message = await ticketMessageService.sendMessage({
      ticketId: req.params.ticketId,
      sender: req.user,
      content: req.body.content,
      io: req.app.get("io"),
    });
    res.json({ msg: "Message sent", message });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error sending message" });
  }
}

module.exports = { sendMessage };
