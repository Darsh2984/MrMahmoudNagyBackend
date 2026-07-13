const prisma = require("../config/prisma");

async function createCategory({ name, description, createdById }) {
  const existing = await prisma.ticketCategory.findUnique({ where: { name } });
  if (existing) throw { status: 400, msg: "Category already exists" };
  return prisma.ticketCategory.create({ data: { name, description, createdById } });
}

async function listCategories() {
  return prisma.ticketCategory.findMany({ orderBy: { name: "asc" } });
}

async function deleteCategory(categoryId) {
  const inUse = await prisma.ticket.count({ where: { categoryId } });
  if (inUse > 0) throw { status: 400, msg: "Cannot delete a category that has tickets — reassign them first" };
  return prisma.ticketCategory.delete({ where: { id: categoryId } });
}

module.exports = { createCategory, listCategories, deleteCategory };
