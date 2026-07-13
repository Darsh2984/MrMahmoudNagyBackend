const prisma = require("../config/prisma");

async function createTopic({ name, chapterId }) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) throw { status: 404, msg: "Chapter not found" };

  return prisma.topic.create({ data: { name, chapterId } });
}

/** This is the main screen students land on — SaveMyExams-style resource browsing. */
async function getTopicWithResources(topicId) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      materials: { orderBy: { createdAt: "asc" } },
      videos: { orderBy: { createdAt: "asc" }, include: { checkpoints: true } },
    },
  });
  if (!topic) throw { status: 404, msg: "Topic not found" };
  return topic;
}

async function updateTopic(topicId, { name }) {
  return prisma.topic.update({ where: { id: topicId }, data: { name } });
}

async function deleteTopic(topicId) {
  const resourceCount = await prisma.material.count({ where: { topicId } });
  const videoCount = await prisma.video.count({ where: { topicId } });
  if (resourceCount > 0 || videoCount > 0) {
    throw { status: 400, msg: "Cannot delete a topic that still has materials/videos — remove those first" };
  }
  return prisma.topic.delete({ where: { id: topicId } });
}

module.exports = { createTopic, getTopicWithResources, updateTopic, deleteTopic };
