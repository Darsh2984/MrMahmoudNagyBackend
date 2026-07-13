const categoryService = require("../services/ticketCategory.service");

async function createCategory(req, res) {
  try {
    const category = await categoryService.createCategory({ ...req.body, createdById: req.user.id });
    res.json({ msg: "Category created", category });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating category" });
  }
}

async function listCategories(req, res) {
  try {
    const categories = await categoryService.listCategories();
    res.json(categories);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing categories" });
  }
}

async function deleteCategory(req, res) {
  try {
    await categoryService.deleteCategory(req.params.categoryId);
    res.json({ msg: "Category deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting category" });
  }
}

module.exports = { createCategory, listCategories, deleteCategory };
