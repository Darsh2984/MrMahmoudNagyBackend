const statsService = require("../services/assistantStats.service");

async function getAssistantStats(req, res) {
  try {
    const stats = await statsService.getAssistantStats(req.params.assistantId, req.query);
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching stats" });
  }
}

async function getAllAssistantStats(req, res) {
  try {
    const stats = await statsService.getAllAssistantStats(req.query);
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching stats" });
  }
}

module.exports = { getAssistantStats, getAllAssistantStats };
