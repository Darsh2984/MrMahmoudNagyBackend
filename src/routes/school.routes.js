const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/school.controller");
const { requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

router.get("/", schoolController.listSchools); // public — needed for the registration screen, before login exists
router.post("/", requireAdminLevel, schoolController.createSchool);
router.delete("/:schoolId", requireAdminLevel, schoolController.deleteSchool);

module.exports = router;
