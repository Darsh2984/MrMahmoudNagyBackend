const prisma = require("../config/prisma");

async function createSchool({ name }) {
  return prisma.school.create({ data: { name } });
}

async function listSchools() {
  return prisma.school.findMany({ orderBy: { name: "asc" } });
}

async function deleteSchool(schoolId) {
  const studentCount = await prisma.user.count({ where: { schoolId } });
  if (studentCount > 0) {
    throw { status: 400, msg: "Cannot delete a school that still has students linked to it" };
  }
  return prisma.school.delete({ where: { id: schoolId } });
}

module.exports = { createSchool, listSchools, deleteSchool };
