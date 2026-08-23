const resourceService = require(
  "../services/resource.service"
);

async function createMaterial(req, res) {
  try {
    const material =
      await resourceService.createMaterial({
        title: req.body.title,

        topicId:
          req.body.topicId,

        chapterId:
          req.body.chapterId,

        unitId:
          req.body.unitId,

        sourceType:
          req.body.sourceType,

        objectKey:
          req.body.objectKey,

        teacherId:
          req.user.id,

        file:
          req.file,
      });

    res.status(201).json({
      msg:
        material.sourceType ===
        "R2_EXISTING"
          ? "Material added from existing R2 file"
          : "Material uploaded",

      material,
    });
  } catch (err) {
    console.error(
      "createMaterial error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error creating material",
      });
  }
}

async function createVideo(req, res) {
  try {
    const video =
      await resourceService.createVideo({
        title:
          req.body.title,

        topicId:
          req.body.topicId,

        chapterId:
          req.body.chapterId,

        unitId:
          req.body.unitId,

        sourceType:
          req.body.sourceType,

        objectKey:
          req.body.objectKey,

        teacherId:
          req.user.id,

        file:
          req.file,
      });

    res.status(201).json({
      msg:
        video.sourceType ===
        "R2_EXISTING"
          ? "Video added from existing R2 file"
          : "Video uploaded",

      video,
    });
  } catch (err) {
    console.error(
      "createVideo error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error creating video",
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
          kind:
            req.params.kind,

          resourceId:
            req.params.resourceId,
        });

    res.json(resource);
  } catch (err) {
    console.error(
      "getResourceViewerData error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error opening resource",
      });
  }
}

async function updateMaterial(
  req,
  res
) {
  try {
    const material =
      await resourceService.updateMaterial({
        materialId:
          req.params.materialId,

        title:
          req.body.title,

        sourceType:
          req.body.sourceType,

        objectKey:
          req.body.objectKey,

        file:
          req.file,
      });

    res.json({
      msg: "Material updated",
      material,
    });
  } catch (err) {
    console.error(
      "updateMaterial error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error updating material",
      });
  }
}

async function updateVideo(
  req,
  res
) {
  try {
    const video =
      await resourceService.updateVideo({
        videoId:
          req.params.videoId,

        title:
          req.body.title,

        sourceType:
          req.body.sourceType,

        objectKey:
          req.body.objectKey,

        file:
          req.file,
      });

    res.json({
      msg: "Video updated",
      video,
    });
  } catch (err) {
    console.error(
      "updateVideo error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error updating video",
      });
  }
}

async function deleteMaterial(
  req,
  res
) {
  try {
    await resourceService.deleteMaterial(
      req.params.materialId
    );

    res.json({
      msg: "Material deleted",
    });
  } catch (err) {
    console.error(
      "deleteMaterial error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error deleting material",
      });
  }
}

async function deleteVideo(
  req,
  res
) {
  try {
    await resourceService.deleteVideo(
      req.params.videoId
    );

    res.json({
      msg: "Video deleted",
    });
  } catch (err) {
    console.error(
      "deleteVideo error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
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