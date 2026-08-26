const prisma = require("../config/prisma");
const storage = require("./storage.service");

const RESOURCE_SOURCE_UPLOAD = "UPLOAD";
const RESOURCE_SOURCE_R2_EXISTING =
  "R2_EXISTING";

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

function normalizeSourceType(
  sourceType,
  fallback = RESOURCE_SOURCE_UPLOAD
) {
  const normalized =
    typeof sourceType === "string"
      ? sourceType.trim().toUpperCase()
      : fallback;

  if (
    normalized !== RESOURCE_SOURCE_UPLOAD &&
    normalized !== RESOURCE_SOURCE_R2_EXISTING
  ) {
    throw {
      status: 400,
      msg:
        "Invalid resource source type. Use UPLOAD or R2_EXISTING",
    };
  }

  return normalized;
}

function normalizeOriginalFilename(
  originalFilename,
  kind
) {
  const fallback =
    kind === "video"
      ? "uploaded-video.mp4"
      : "uploaded-material";

  return typeof originalFilename === "string" &&
    originalFilename.trim()
    ? originalFilename.trim()
    : fallback;
}

function normalizeContentType(
  contentType,
  kind
) {
  if (
    typeof contentType === "string" &&
    contentType.trim()
  ) {
    return contentType.trim();
  }

  return kind === "video"
    ? "video/mp4"
    : "application/octet-stream";
}

function normalizeFileSize(size) {
  const numericSize =
    Number(size);

  if (
    Number.isFinite(numericSize) &&
    numericSize > 0
  ) {
    return numericSize;
  }

  return null;
}

async function assertChapterExists(chapterId) {
  if (!chapterId) {
    throw {
      status: 400,
      msg: "chapterId is required",
    };
  }

  const chapter =
    await prisma.chapter.findUnique({
      where: {
        id: chapterId,
      },
      select: {
        id: true,
        name: true,
        unitId: true,
        unit: {
          select: {
            id: true,
            name: true,
            yearId: true,
            year: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

  if (!chapter) {
    throw {
      status: 404,
      msg: "Chapter not found",
    };
  }

  return chapter;
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

function isPlatformOwnedResource(resource) {
  return (
    !resource.sourceType ||
    resource.sourceType ===
      RESOURCE_SOURCE_UPLOAD
  );
}

async function validateExistingR2Object(
  objectKey
) {
  const normalizedObjectKey =
    storage.normalizeObjectKey(
      objectKey
    );

  const exists =
    await storage.fileExists(
      normalizedObjectKey
    );

  if (!exists) {
    throw {
      status: 404,
      msg:
        "The R2 object could not be found. Check the object key and try again",
    };
  }

  return normalizedObjectKey;
}

async function resolveResourceObject({
  sourceType,
  file,
  objectKey,
  folder,
}) {
  const normalizedSourceType =
    normalizeSourceType(
      sourceType
    );

  if (
    normalizedSourceType ===
    RESOURCE_SOURCE_R2_EXISTING
  ) {
    if (
      typeof objectKey !== "string" ||
      !objectKey.trim()
    ) {
      throw {
        status: 400,
        msg:
          "Enter the R2 object key for the existing file",
      };
    }

    const normalizedObjectKey =
      await validateExistingR2Object(
        objectKey
      );

    return {
      sourceType:
        RESOURCE_SOURCE_R2_EXISTING,

      objectName:
        normalizedObjectKey,

      uploadedByPlatform: false,
    };
  }

  if (!file) {
    throw {
      status: 400,
      msg: "No file provided",
    };
  }

  const uploadedObjectName =
    await storage.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      folder
    );

  return {
    sourceType:
      RESOURCE_SOURCE_UPLOAD,

    objectName:
      uploadedObjectName,

    uploadedByPlatform: true,
  };
}

async function startDirectUpload({
  kind,
  title,
  chapterId,
  originalFilename,
  contentType,
  size,
}) {
  validateResourceKind(kind);

  const normalizedTitle =
    validateTitle(title);

  await assertChapterExists(chapterId);

  const normalizedOriginalFilename =
    normalizeOriginalFilename(
      originalFilename,
      kind
    );

  const normalizedContentType =
    normalizeContentType(
      contentType,
      kind
    );

  const normalizedSize =
    normalizeFileSize(size);

  const folder =
    kind === "video"
      ? "videos"
      : "materials";

  const objectName =
    storage.createObjectKey(
      normalizedOriginalFilename,
      folder
    );

  const signedUpload =
    await storage.createPresignedUploadUrl({
      objectName,
      originalFilename:
        normalizedOriginalFilename,
      contentType:
        normalizedContentType,
      expiresInMinutes: 60,
    });

  return {
    kind,
    title:
      normalizedTitle,
    chapterId,
    objectKey:
      signedUpload.objectName,
    uploadUrl:
      signedUpload.uploadUrl,
    expiresInSeconds:
      signedUpload.expiresInSeconds,
    contentType:
      signedUpload.contentType,
    originalFilename:
      normalizedOriginalFilename,
    size:
      normalizedSize,
    method: "PUT",
    headers: {
      "Content-Type":
        signedUpload.contentType,
    },
  };
}

async function completeDirectUpload({
  kind,
  title,
  chapterId,
  objectKey,
  teacherId,
}) {
  validateResourceKind(kind);

  const normalizedTitle =
    validateTitle(title);

  await assertChapterExists(chapterId);

  const normalizedObjectKey =
    storage.normalizeObjectKey(
      objectKey
    );

  const metadata =
    await storage.getFileMetadata(
      normalizedObjectKey
    );

  if (kind === "material") {
    return prisma.material.create({
      data: {
        title:
          normalizedTitle,

        fileUrl:
          normalizedObjectKey,

        sourceType:
          RESOURCE_SOURCE_UPLOAD,

        chapterId,

        topicId: null,
        unitId: null,

        teacherId,
      },
    });
  }

  return prisma.video.create({
    data: {
      title:
        normalizedTitle,

      videoUrl:
        normalizedObjectKey,

      sourceType:
        RESOURCE_SOURCE_UPLOAD,

      chapterId,

      topicId: null,
      unitId: null,

      teacherId,
    },
  });
}

async function createMaterial({
  title,
  chapterId,
  teacherId,
  file,
  sourceType = RESOURCE_SOURCE_UPLOAD,
  objectKey,
}) {
  const normalizedTitle =
    validateTitle(title);

  await assertChapterExists(chapterId);

  const resolvedSource =
    await resolveResourceObject({
      sourceType,
      file,
      objectKey,
      folder: "materials",
    });

  try {
    return await prisma.material.create({
      data: {
        title:
          normalizedTitle,

        fileUrl:
          resolvedSource.objectName,

        sourceType:
          resolvedSource.sourceType,

        chapterId,

        topicId: null,
        unitId: null,

        teacherId,
      },
    });
  } catch (error) {
    if (
      resolvedSource.uploadedByPlatform
    ) {
      await storage.deleteFile(
        resolvedSource.objectName
      );
    }

    throw error;
  }
}

async function createVideo({
  title,
  chapterId,
  teacherId,
  file,
  sourceType = RESOURCE_SOURCE_UPLOAD,
  objectKey,
}) {
  const normalizedTitle =
    validateTitle(title);

  await assertChapterExists(chapterId);

  const resolvedSource =
    await resolveResourceObject({
      sourceType,
      file,
      objectKey,
      folder: "videos",
    });

  try {
    return await prisma.video.create({
      data: {
        title:
          normalizedTitle,

        videoUrl:
          resolvedSource.objectName,

        sourceType:
          resolvedSource.sourceType,

        chapterId,

        topicId: null,
        unitId: null,

        teacherId,
      },
    });
  } catch (error) {
    if (
      resolvedSource.uploadedByPlatform
    ) {
      await storage.deleteFile(
        resolvedSource.objectName
      );
    }

    throw error;
  }
}

async function getResourceViewerData({
  kind,
  resourceId,
}) {
  const resource =
    await findResource(
      kind,
      resourceId
    );

  const objectName =
    getObjectName(
      kind,
      resource
    );

  if (!objectName) {
    throw {
      status: 404,
      msg:
        "Resource file is unavailable",
    };
  }

  const [
    signedUrl,
    metadata,
  ] = await Promise.all([
    storage.getSignedUrl(
      objectName,
      5
    ),

    storage.getFileMetadata(
      objectName
    ),
  ]);

  return {
    id:
      resource.id,

    kind,

    title:
      resource.title,

    sourceType:
      resource.sourceType ||
      RESOURCE_SOURCE_UPLOAD,

    url:
      signedUrl,

    expiresInMinutes: 5,

    contentType:
      metadata?.contentType ||
      (kind === "video"
        ? "video/mp4"
        : "application/octet-stream"),

    size:
      metadata?.size || null,

    originalName:
      metadata?.originalName ||
      null,
  };
}

async function updateMaterial({
  materialId,
  title,
  file,
  sourceType,
  objectKey,
}) {
  const existing =
    await findResource(
      "material",
      materialId
    );

  const normalizedTitle =
    validateTitle(title);

  const replacementRequested =
    Boolean(file) ||
    Boolean(
      typeof objectKey === "string" &&
      objectKey.trim()
    ) ||
    sourceType ===
      RESOURCE_SOURCE_R2_EXISTING ||
    sourceType ===
      RESOURCE_SOURCE_UPLOAD;

  let resolvedSource = null;

  if (replacementRequested) {
    const requestedSourceType =
      sourceType ||
      (file
        ? RESOURCE_SOURCE_UPLOAD
        : existing.sourceType ||
          RESOURCE_SOURCE_UPLOAD);

    resolvedSource =
      await resolveResourceObject({
        sourceType:
          requestedSourceType,

        file,

        objectKey,

        folder:
          "materials",
      });
  }

  try {
    const updated =
      await prisma.material.update({
        where: {
          id: materialId,
        },

        data: {
          title:
            normalizedTitle,

          ...(resolvedSource
            ? {
                fileUrl:
                  resolvedSource.objectName,

                sourceType:
                  resolvedSource.sourceType,
              }
            : {}),
        },
      });

    if (
      resolvedSource &&
      existing.fileUrl &&
      existing.fileUrl !==
        resolvedSource.objectName &&
      isPlatformOwnedResource(
        existing
      )
    ) {
      await storage.deleteFile(
        existing.fileUrl
      );
    }

    return updated;
  } catch (error) {
    if (
      resolvedSource
        ?.uploadedByPlatform
    ) {
      await storage.deleteFile(
        resolvedSource.objectName
      );
    }

    throw error;
  }
}

async function updateVideo({
  videoId,
  title,
  file,
  sourceType,
  objectKey,
}) {
  const existing =
    await findResource(
      "video",
      videoId
    );

  const normalizedTitle =
    validateTitle(title);

  const replacementRequested =
    Boolean(file) ||
    Boolean(
      typeof objectKey === "string" &&
      objectKey.trim()
    ) ||
    sourceType ===
      RESOURCE_SOURCE_R2_EXISTING ||
    sourceType ===
      RESOURCE_SOURCE_UPLOAD;

  let resolvedSource = null;

  if (replacementRequested) {
    const requestedSourceType =
      sourceType ||
      (file
        ? RESOURCE_SOURCE_UPLOAD
        : existing.sourceType ||
          RESOURCE_SOURCE_UPLOAD);

    resolvedSource =
      await resolveResourceObject({
        sourceType:
          requestedSourceType,

        file,

        objectKey,

        folder:
          "videos",
      });
  }

  try {
    const updated =
      await prisma.video.update({
        where: {
          id: videoId,
        },

        data: {
          title:
            normalizedTitle,

          ...(resolvedSource
            ? {
                videoUrl:
                  resolvedSource.objectName,

                sourceType:
                  resolvedSource.sourceType,
              }
            : {}),
        },
      });

    if (
      resolvedSource &&
      existing.videoUrl &&
      existing.videoUrl !==
        resolvedSource.objectName &&
      isPlatformOwnedResource(
        existing
      )
    ) {
      await storage.deleteFile(
        existing.videoUrl
      );
    }

    return updated;
  } catch (error) {
    if (
      resolvedSource
        ?.uploadedByPlatform
    ) {
      await storage.deleteFile(
        resolvedSource.objectName
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

  if (
    material.fileUrl &&
    isPlatformOwnedResource(
      material
    )
  ) {
    await storage.deleteFile(
      material.fileUrl
    );
  }

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

  if (
    video.videoUrl &&
    isPlatformOwnedResource(
      video
    )
  ) {
    await storage.deleteFile(
      video.videoUrl
    );
  }

  return prisma.video.delete({
    where: {
      id: videoId,
    },
  });
}

module.exports = {
  startDirectUpload,
  completeDirectUpload,
  createMaterial,
  createVideo,
  getResourceViewerData,
  updateMaterial,
  updateVideo,
  deleteMaterial,
  deleteVideo,
};