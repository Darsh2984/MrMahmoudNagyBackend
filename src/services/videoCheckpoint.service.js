const prisma = require("../config/prisma");

async function createCheckpoint({ videoId, timeInSeconds, questionIds }) {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) throw { status: 404, msg: "Video not found" };
  if (!questionIds || questionIds.length === 0) throw { status: 400, msg: "At least one questionId is required" };

  return prisma.videoCheckpoint.create({
    data: {
      videoId,
      timeInSeconds,
      questions: { connect: questionIds.map((id) => ({ id })) },
    },
    include: { questions: true },
  });
}

async function listForVideo(videoId) {
  return prisma.videoCheckpoint.findMany({
    where: { videoId },
    include: { questions: true },
    orderBy: { timeInSeconds: "asc" },
  });
}

async function deleteCheckpoint(checkpointId) {
  return prisma.videoCheckpoint.delete({ where: { id: checkpointId } });
}

module.exports = { createCheckpoint, listForVideo, deleteCheckpoint };
