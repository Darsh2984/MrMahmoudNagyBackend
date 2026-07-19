const prisma = require("../config/prisma");
const storage = require("./storage.service");

/**
 * A resource must be attached to exactly one level:
 * Unit, Chapter, or Topic.
 */
function validateAttachmentLevel({
  topicId,
  chapterId,
  unitId,
}) {
  const provided = [
    topicId,
    chapterId,
    unitId,
  ].filter(Boolean);

  if (provided.length !== 1) {
    throw {
      status: 400,
      msg:
        "Provide exactly one of topicId, chapterId, " +
        "or unitId — resources attach to one level only",
    };
  }
}

function validateTitle(title) {
  const normalizedTitle =
    typeof title === "string"
      ? title.trim()
      : "";

  if (!normalizedTitle) {
    throw {
      status: 400,
      msg: "Resource title is required",
    };
  }

  return normalizedTitle;
}

function validateResourceKind(kind) {
  if (
    kind !== "material" &&
    kind !== "video"
  ) {
    throw {
      status: 400,
      msg: "Invalid resource type",
    };
  }
}

async function findResource(kind, resourceId) {
  validateResourceKind(kind);

  const resource =
    kind === "material"
      ? await prisma.material.findUnique({
          where: {
            id: resourceId,
          },
        })
      : await prisma.video.findUnique({
          where: {
            id: resourceId,
          },
        });

  if (!resource) {
    throw {
      status: 404,
      msg:
        kind === "material"
          ? "Material not found"
          : "Video not found",
    };
  }

  return resource;
}

function getObjectName(kind, resource) {
  return kind === "material"
    ? resource.fileUrl
    : resource.videoUrl;
}

async function createMaterial({
  title,
  topicId,
  chapterId,
  unitId,
  teacherId,
  file,
}) {
  validateAttachmentLevel({
    topicId,
    chapterId,
    unitId,
  });

  const normalizedTitle =
    validateTitle(title);

  if (!file) {
    throw {
      status: 400,
      msg: "No file provided",
    };
  }

  const fileUrl =
    await storage.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      "materials"
    );

  try {
    return await prisma.material.create({
      data: {
        title: normalizedTitle,
        fileUrl,
        topicId: topicId || null,
        chapterId: chapterId || null,
        unitId: unitId || null,
        teacherId,
      },
    });
  } catch (error) {
    await storage.deleteFile(fileUrl);
    throw error;
  }
}

async function createVideo({
  title,
  topicId,
  chapterId,
  unitId,
  teacherId,
  file,
}) {
  validateAttachmentLevel({
    topicId,
    chapterId,
    unitId,
  });

  const normalizedTitle =
    validateTitle(title);

  if (!file) {
    throw {
      status: 400,
      msg: "No file provided",
    };
  }

  const videoUrl =
    await storage.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      "videos"
    );

  try {
    return await prisma.video.create({
      data: {
        title: normalizedTitle,
        videoUrl,
        topicId: topicId || null,
        chapterId: chapterId || null,
        unitId: unitId || null,
        teacherId,
      },
    });
  } catch (error) {
    await storage.deleteFile(videoUrl);
    throw error;
  }
}

/**
 * Returns resource metadata and a temporary private signed URL.
 */
async function getResourceViewerData({
  kind,
  resourceId,
}) {
  const resource =
    await findResource(kind, resourceId);

  const objectName =
    getObjectName(kind, resource);

  if (!objectName) {
    throw {
      status: 404,
      msg: "Resource file is unavailable",
    };
  }

  const [signedUrl, metadata] =
    await Promise.all([
      storage.getSignedUrl(
        objectName,
        5
      ),

      storage.getFileMetadata(
        objectName
      ),
    ]);

  return {
    id: resource.id,
    kind,
    title: resource.title,
    url: signedUrl,
    expiresInMinutes: 5,
    contentType:
      metadata?.contentType ||
      (kind === "video"
        ? "video/mp4"
        : "application/octet-stream"),
    size: metadata?.size || null,
    originalName:
      metadata?.originalName || null,
  };
}

/**
 * Updates title and optionally replaces the uploaded file.
 */
async function updateMaterial({
  materialId,
  title,
  file,
}) {
  const existing =
    await findResource(
      "material",
      materialId
    );

  const normalizedTitle =
    validateTitle(title);

  let nextObjectName = null;

  if (file) {
    nextObjectName =
      await storage.uploadBuffer(
        file.buffer,
        file.originalname,
        file.mimetype,
        "materials"
      );
  }

  try {
    const updated =
      await prisma.material.update({
        where: {
          id: materialId,
        },

        data: {
          title: normalizedTitle,

          ...(nextObjectName
            ? {
                fileUrl: nextObjectName,
              }
            : {}),
        },
      });

    if (
      nextObjectName &&
      existing.fileUrl &&
      existing.fileUrl !== nextObjectName
    ) {
      await storage.deleteFile(
        existing.fileUrl
      );
    }

    return updated;
  } catch (error) {
    if (nextObjectName) {
      await storage.deleteFile(
        nextObjectName
      );
    }

    throw error;
  }
}

async function updateVideo({
  videoId,
  title,
  file,
}) {
  const existing =
    await findResource(
      "video",
      videoId
    );

  const normalizedTitle =
    validateTitle(title);

  let nextObjectName = null;

  if (file) {
    nextObjectName =
      await storage.uploadBuffer(
        file.buffer,
        file.originalname,
        file.mimetype,
        "videos"
      );
  }

  try {
    const updated =
      await prisma.video.update({
        where: {
          id: videoId,
        },

        data: {
          title: normalizedTitle,

          ...(nextObjectName
            ? {
                videoUrl: nextObjectName,
              }
            : {}),
        },
      });

    if (
      nextObjectName &&
      existing.videoUrl &&
      existing.videoUrl !== nextObjectName
    ) {
      await storage.deleteFile(
        existing.videoUrl
      );
    }

    return updated;
  } catch (error) {
    if (nextObjectName) {
      await storage.deleteFile(
        nextObjectName
      );
    }

    throw error;
  }
}

async function deleteMaterial(materialId) {
  const material =
    await findResource(
      "material",
      materialId
    );

  await storage.deleteFile(
    material.fileUrl
  );

  return prisma.material.delete({
    where: {
      id: materialId,
    },
  });
}

async function deleteVideo(videoId) {
  const video =
    await findResource(
      "video",
      videoId
    );

  await storage.deleteFile(
    video.videoUrl
  );

  return prisma.video.delete({
    where: {
      id: videoId,
    },
  });
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