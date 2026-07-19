const resourceService = require(
  "../services/resource.service"
);

async function createMaterial(req, res) {
  try {
    const material =
      await resourceService.createMaterial({
        ...req.body,
        teacherId: req.user.id,
        file: req.file,
      });

    res.status(201).json({
      msg: "Material uploaded",
      material,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error uploading material",
      });
  }
}

async function createVideo(req, res) {
  try {
    const video =
      await resourceService.createVideo({
        ...req.body,
        teacherId: req.user.id,
        file: req.file,
      });

    res.status(201).json({
      msg: "Video uploaded",
      video,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error uploading video",
      });
  }
}

async function getResourceViewerData(
  req,
  res
) {
  try {
    const resource =
      await resourceService
        .getResourceViewerData({
          kind: req.params.kind,
          resourceId:
            req.params.resourceId,
        });

    res.json(resource);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error opening resource",
      });
  }
}

async function updateMaterial(req, res) {
  try {
    const material =
      await resourceService.updateMaterial({
        materialId:
          req.params.materialId,

        title: req.body.title,
        file: req.file,
      });

    res.json({
      msg: "Material updated",
      material,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error updating material",
      });
  }
}

async function updateVideo(req, res) {
  try {
    const video =
      await resourceService.updateVideo({
        videoId: req.params.videoId,
        title: req.body.title,
        file: req.file,
      });

    res.json({
      msg: "Video updated",
      video,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error updating video",
      });
  }
}

async function deleteMaterial(req, res) {
  try {
    await resourceService.deleteMaterial(
      req.params.materialId
    );

    res.json({
      msg: "Material deleted",
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error deleting material",
      });
  }
}

async function deleteVideo(req, res) {
  try {
    await resourceService.deleteVideo(
      req.params.videoId
    );

    res.json({
      msg: "Video deleted",
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error deleting video",
      });
  }
}

module.exports = {
  createMaterial,
  createVideo,
  getResourceViewerData,
  updateMaterial,
  updateVideo,
  deleteMaterial,
  deleteVideo,
};