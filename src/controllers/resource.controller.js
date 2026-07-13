const resourceService = require("../services/resource.service");

async function createMaterial(req, res) {
  try {
    const material = await resourceService.createMaterial({
      ...req.body,
      teacherId: req.user.id,
      file: req.file,
    });
    res.json({ msg: "Material uploaded", material });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error uploading material" });
  }
}

async function createVideo(req, res) {
  try {
    const video = await resourceService.createVideo({
      ...req.body,
      teacherId: req.user.id,
      file: req.file,
    });
    res.json({ msg: "Video uploaded", video });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error uploading video" });
  }
}

async function deleteMaterial(req, res) {
  try {
    await resourceService.deleteMaterial(req.params.materialId);
    res.json({ msg: "Material deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting material" });
  }
}

async function deleteVideo(req, res) {
  try {
    await resourceService.deleteVideo(req.params.videoId);
    res.json({ msg: "Video deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting video" });
  }
}

module.exports = { createMaterial, createVideo, deleteMaterial, deleteVideo };
