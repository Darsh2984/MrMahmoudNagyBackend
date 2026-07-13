const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/ticketCategory.controller");
const { requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

router.get("/", requireAuth, categoryController.listCategories);
router.post("/", requireAdminLevel, categoryController.createCategory);
router.delete("/:categoryId", requireAdminLevel, categoryController.deleteCategory);

module.exports = router;
