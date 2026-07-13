const prisma = require("../config/prisma");

async function createYear({ name, teacherId }) {
  return prisma.year.create({ data: { name, teacherId } });
}

async function listYearsForTeacher(teacherId) {
  return prisma.year.findMany({ where: { teacherId }, orderBy: { createdAt: "asc" } });
}

async function getYear(yearId) {
  const year = await prisma.year.findUnique({
    where: { id: yearId },
    include: { groups: true, units: { select: { id: true, name: true } } },
  });
  if (!year) throw { status: 404, msg: "Year not found" };
  return year;
}

async function updateYear(yearId, { name }) {
  return prisma.year.update({ where: { id: yearId }, data: { name } });
}

async function deleteYear(yearId) {
  const groupCount = await prisma.group.count({ where: { yearId } });
  const unitCount = await prisma.unit.count({ where: { yearId } });
  if (groupCount > 0 || unitCount > 0) {
    throw { status: 400, msg: "Cannot delete a year that still has groups or units — remove those first" };
  }
  return prisma.year.delete({ where: { id: yearId } });
}

/** zoomLinks stored as JSON array: [{ title, link }] */
async function updateZoomLinks(yearId, zoomLinks) {
  const year = await prisma.year.findUnique({ where: { id: yearId } });
  if (!year) throw { status: 404, msg: "Year not found" };
  return prisma.year.update({ where: { id: yearId }, data: { zoomLinks } });
}

async function getZoomLinks(yearId) {
  const year = await prisma.year.findUnique({ where: { id: yearId }, select: { zoomLinks: true } });
  if (!year) throw { status: 404, msg: "Year not found" };
  return year.zoomLinks || [];
}

module.exports = {
  createYear,
  listYearsForTeacher,
  getYear,
  updateYear,
  deleteYear,
  updateZoomLinks,
  getZoomLinks,
};
