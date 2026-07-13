const prisma = require("../config/prisma");
const storage = require("./storage.service");

/**
 * Enforces "exactly one of topicId/chapterId/unitId is set" — per spec, resources
 * are USUALLY attached at Topic level, but can (rarely) go directly on a Chapter or
 * Unit. Exactly one must be provided, never zero, never more than one.
 */
function validateAttachmentLevel({ topicId, chapterId, unitId }) {
  const provided = [topicId, chapterId, unitId].filter(Boolean);
  if (provided.length !== 1) {
    throw {
      status: 400,
      msg: "Provide exactly one of topicId, chapterId, or unitId — resources attach to one level only",
    };
  }
}

async function createMaterial({ title, topicId, chapterId, unitId, teacherId, file }) {
  validateAttachmentLevel({ topicId, chapterId, unitId });
  if (!file) throw { status: 400, msg: "No file provided" };

  const fileUrl = await storage.uploadBuffer(file.buffer, file.originalname, file.mimetype, "materials");

  return prisma.material.create({
    data: {
      title,
      fileUrl,
      topicId: topicId || null,
      chapterId: chapterId || null,
      unitId: unitId || null,
      teacherId,
    },
  });
}

async function createVideo({ title, topicId, chapterId, unitId, teacherId, file }) {
  validateAttachmentLevel({ topicId, chapterId, unitId });
  if (!file) throw { status: 400, msg: "No file provided" };

  const videoUrl = await storage.uploadBuffer(file.buffer, file.originalname, file.mimetype, "videos");

  return prisma.video.create({
    data: {
      title,
      videoUrl,
      topicId: topicId || null,
      chapterId: chapterId || null,
      unitId: unitId || null,
      teacherId,
    },
  });
}

async function deleteMaterial(materialId) {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) throw { status: 404, msg: "Material not found" };
  await storage.deleteFile(material.fileUrl);
  return prisma.material.delete({ where: { id: materialId } });
}

async function deleteVideo(videoId) {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) throw { status: 404, msg: "Video not found" };
  await storage.deleteFile(video.videoUrl);
  return prisma.video.delete({ where: { id: videoId } });
}

module.exports = { createMaterial, createVideo, deleteMaterial, deleteVideo };
