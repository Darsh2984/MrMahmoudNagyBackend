const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/school.controller");
const { requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

router.get("/", requireAuth, schoolController.listSchools);
router.post("/", requireAdminLevel, schoolController.createSchool);
router.delete("/:schoolId", requireAdminLevel, schoolController.deleteSchool);

module.exports = router;
