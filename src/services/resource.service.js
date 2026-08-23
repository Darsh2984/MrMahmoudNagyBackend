const prisma = require("../config/prisma");
const storage = require("./storage.service");

const RESOURCE_SOURCE_UPLOAD = "UPLOAD";
const RESOURCE_SOURCE_R2_EXISTING =
  "R2_EXISTING";

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
        "Invalid resource source type. " +
        "Use UPLOAD or R2_EXISTING",
    };
  }

  return normalized;
}

async function findResource(
  kind,
  resourceId
) {
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

function getObjectName(
  kind,
  resource
) {
  return kind === "material"
    ? resource.fileUrl
    : resource.videoUrl;
}

function isPlatformOwnedResource(
  resource
) {
  return (
    !resource.sourceType ||
    resource.sourceType ===
      RESOURCE_SOURCE_UPLOAD
  );
}

/**
 * Validates and normalizes a manually entered
 * existing R2 object key.
 *
 * The object must already exist in the configured
 * R2 bucket.
 */
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
        "The R2 object could not be found. " +
        "Check the object key and try again",
    };
  }

  return normalizedObjectKey;
}

/**
 * Resolves a resource source into an R2 object key.
 *
 * UPLOAD:
 *   Uploads the supplied file and returns the newly
 *   created R2 key.
 *
 * R2_EXISTING:
 *   Validates that the manually entered R2 key
 *   already exists and returns that key without
 *   uploading anything.
 */
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

async function createMaterial({
  title,
  topicId,
  chapterId,
  unitId,
  teacherId,
  file,
  sourceType = RESOURCE_SOURCE_UPLOAD,
  objectKey,
}) {
  validateAttachmentLevel({
    topicId,
    chapterId,
    unitId,
  });

  const normalizedTitle =
    validateTitle(title);

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

        topicId:
          topicId || null,

        chapterId:
          chapterId || null,

        unitId:
          unitId || null,

        teacherId,
      },
    });
  } catch (error) {
    /*
     * Only delete the new R2 object if our platform
     * uploaded it.
     *
     * Never delete an object supplied using
     * R2_EXISTING because the teacher manually
     * manages that object.
     */
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
  topicId,
  chapterId,
  unitId,
  teacherId,
  file,
  sourceType = RESOURCE_SOURCE_UPLOAD,
  objectKey,
}) {
  validateAttachmentLevel({
    topicId,
    chapterId,
    unitId,
  });

  const normalizedTitle =
    validateTitle(title);

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

        topicId:
          topicId || null,

        chapterId:
          chapterId || null,

        unitId:
          unitId || null,

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

/**
 * Returns resource metadata and a temporary
 * private signed URL.
 *
 * Both UPLOAD and R2_EXISTING use the same
 * viewer path because both ultimately reference
 * an object key in the configured R2 bucket.
 */
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

/**
 * Updates a material.
 *
 * Supported behaviors:
 *
 * 1. Title only:
 *    no sourceType / no file / no objectKey
 *
 * 2. Replace with uploaded file:
 *    sourceType = UPLOAD
 *    file supplied
 *
 * 3. Replace with manually managed R2 object:
 *    sourceType = R2_EXISTING
 *    objectKey supplied
 *
 * If the old object was UPLOAD-owned, it is deleted
 * after a successful replacement.
 *
 * If the old object was R2_EXISTING, it is never
 * automatically deleted.
 */
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
    /*
     * If an uploaded file is supplied and sourceType
     * was omitted, treat it as a normal UPLOAD.
     */
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

    /*
     * Delete the previous file only if:
     *
     * - a replacement happened
     * - the old resource was platform-owned UPLOAD
     * - old and new keys are different
     */
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
    /*
     * If DB update failed and we just uploaded a new
     * platform-owned file, remove that new file.
     *
     * Do not remove R2_EXISTING objects.
     */
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

async function deleteMaterial(
  materialId
) {
  const material =
    await findResource(
      "material",
      materialId
    );

  /*
   * Only platform-owned uploads are physically
   * deleted from R2.
   *
   * R2_EXISTING files are manually managed by the
   * teacher and remain in R2.
   */
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

async function deleteVideo(
  videoId
) {
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
  createMaterial,
  createVideo,
  getResourceViewerData,
  updateMaterial,
  updateVideo,
  deleteMaterial,
  deleteVideo,
};