const service = require("../services/videoCheckpoint.service");

async function createCheckpoint(req, res) {
  try {
    const checkpoint = await service.createCheckpoint(req.body);
    res.json({ msg: "Checkpoint created", checkpoint });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating checkpoint" });
  }
}

async function listForVideo(req, res) {
  try {
    const checkpoints = await service.listForVideo(req.params.videoId);
    res.json(checkpoints);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing checkpoints" });
  }
}

async function deleteCheckpoint(req, res) {
  try {
    await service.deleteCheckpoint(req.params.checkpointId);
    res.json({ msg: "Checkpoint deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting checkpoint" });
  }
}

module.exports = { createCheckpoint, listForVideo, deleteCheckpoint };
