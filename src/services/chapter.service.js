const prisma = require("../config/prisma");

async function createChapter({ name, unitId }) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw { status: 404, msg: "Unit not found" };

  return prisma.chapter.create({ data: { name, unitId } });
}

async function getChapterWithTopics(chapterId) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      topics: { orderBy: { createdAt: "asc" }, include: { _count: { select: { materials: true, videos: true } } } },
      materials: true, // resources uploaded directly at chapter level (rare, per spec)
      videos: true,
    },
  });
  if (!chapter) throw { status: 404, msg: "Chapter not found" };
  return chapter;
}

async function updateChapter(chapterId, { name }) {
  return prisma.chapter.update({ where: { id: chapterId }, data: { name } });
}

async function deleteChapter(chapterId) {
  const topicCount = await prisma.topic.count({ where: { chapterId } });
  if (topicCount > 0) {
    throw { status: 400, msg: "Cannot delete a chapter that still has topics — remove topics first" };
  }
  return prisma.chapter.delete({ where: { id: chapterId } });
}

module.exports = { createChapter, getChapterWithTopics, updateChapter, deleteChapter };
