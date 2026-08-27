const resourceService = require(
  "../services/resource.service"
);

async function startDirectUpload(req, res) {
  try {
    const upload =
      await resourceService.startDirectUpload({
        kind: req.body.kind,
        title: req.body.title,
        chapterId: req.body.chapterId,
        originalFilename:
          req.body.originalFilename ||
          req.body.fileName,
        contentType:
          req.body.contentType,
        size:
          req.body.size,
      });

    res.json({
      msg: "Direct upload URL created",
      upload,
    });
  } catch (err) {
    console.error(
      "startDirectUpload error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error preparing direct upload",
      });
  }
}

async function completeDirectUpload(req, res) {
  try {
    const resource =
      await resourceService.completeDirectUpload({
        kind: req.body.kind,
        title: req.body.title,
        chapterId: req.body.chapterId,
        objectKey:
          req.body.objectKey,
        teacherId:
          req.user.id,
      });

    res.status(201).json({
      msg:
        req.body.kind === "video"
          ? "Video uploaded"
          : "Material uploaded",
      resource,
    });
  } catch (err) {
    console.error(
      "completeDirectUpload error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error completing direct upload",
      });
  }
}

async function startMultipartUpload(req, res) {
  try {
    const upload =
      await resourceService.startMultipartUpload({
        kind: req.body.kind,
        title: req.body.title,
        chapterId:
          req.body.chapterId,
        originalFilename:
          req.body.originalFilename ||
          req.body.fileName,
        contentType:
          req.body.contentType,
        size:
          req.body.size,
        partSize:
          req.body.partSize,
        partCount:
          req.body.partCount,
      });

    res.json({
      msg:
        "Multipart upload started",
      upload,
    });
  } catch (err) {
    console.error(
      "startMultipartUpload error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error starting multipart upload",
      });
  }
}

async function signMultipartPart(req, res) {
  try {
    const part =
      await resourceService.signMultipartPart({
        objectKey:
          req.body.objectKey,
        uploadId:
          req.body.uploadId,
        partNumber:
          req.body.partNumber,
      });

    res.json({
      msg:
        "Multipart part URL created",
      part,
    });
  } catch (err) {
    console.error(
      "signMultipartPart error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error signing multipart part",
      });
  }
}

async function completeMultipartUpload(
  req,
  res
) {
  try {
    const resource =
      await resourceService.completeMultipartUpload({
        kind:
          req.body.kind,
        title:
          req.body.title,
        chapterId:
          req.body.chapterId,
        objectKey:
          req.body.objectKey,
        uploadId:
          req.body.uploadId,
        parts:
          req.body.parts,
        teacherId:
          req.user.id,
      });

    res.status(201).json({
      msg:
        req.body.kind === "video"
          ? "Video uploaded"
          : "Material uploaded",
      resource,
    });
  } catch (err) {
    console.error(
      "completeMultipartUpload error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error completing multipart upload",
      });
  }
}

async function abortMultipartUpload(req, res) {
  try {
    const result =
      await resourceService.abortMultipartUpload({
        objectKey:
          req.body.objectKey,
        uploadId:
          req.body.uploadId,
      });

    res.json({
      msg:
        "Multipart upload aborted",
      result,
    });
  } catch (err) {
    console.error(
      "abortMultipartUpload error:",
      err
    );

    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          err.message ||
          "Error aborting multipart upload",
      });
  }
}

async function createMaterial(req, res) {
  try {
    const material =
      await resourceService.createMaterial({
        title: req.body.title,

        chapterId:
          req.body.chapterId,

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

        chapterId:
          req.body.chapterId,

        sourceType:
          req.body.sourceType,

        objectKey:
          req.body.objectKey ||
          req.body.driveUrl ||
          req.body.googleDriveUrl,

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

async function updateMaterial(req, res) {
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

async function updateVideo(req, res) {
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
          req.body.objectKey ||
          req.body.driveUrl ||
          req.body.googleDriveUrl,

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

async function deleteMaterial(req, res) {
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

async function deleteVideo(req, res) {
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
  startDirectUpload,
  completeDirectUpload,
  startMultipartUpload,
  signMultipartPart,
  completeMultipartUpload,
  abortMultipartUpload,
  createMaterial,
  createVideo,
  getResourceViewerData,
  updateMaterial,
  updateVideo,
  deleteMaterial,
  deleteVideo,
};