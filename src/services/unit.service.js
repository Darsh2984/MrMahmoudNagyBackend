const prisma = require("../config/prisma");

async function createUnit({ name, yearId, teacherId }) {
  const year = await prisma.year.findUnique({ where: { id: yearId } });
  if (!year) throw { status: 404, msg: "Year not found" };

  return prisma.unit.create({ data: { name, yearId, teacherId } });
}

async function listUnitsByYear(yearId) {
  return prisma.unit.findMany({
    where: { yearId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { chapters: true } } },
  });
}

async function getUnitWithChapters(unitId) {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      chapters: { orderBy: { createdAt: "asc" }, include: { _count: { select: { topics: true } } } },
      materials: true, // resources uploaded directly at unit level (rare, per spec)
      videos: true,
    },
  });
  if (!unit) throw { status: 404, msg: "Unit not found" };
  return unit;
}

async function updateUnit(unitId, { name }) {
  return prisma.unit.update({ where: { id: unitId }, data: { name } });
}

async function deleteUnit(unitId) {
  // Cascade behavior intentionally NOT automatic — chapters/topics/resources under
  // a unit are real academic content. Require the caller to confirm cascade explicitly
  // at the route/UI level before we ever wire up a hard delete here.
  const chapterCount = await prisma.chapter.count({ where: { unitId } });
  if (chapterCount > 0) {
    throw { status: 400, msg: "Cannot delete a unit that still has chapters — remove chapters first" };
  }
  return prisma.unit.delete({ where: { id: unitId } });
}

module.exports = { createUnit, listUnitsByYear, getUnitWithChapters, updateUnit, deleteUnit };
