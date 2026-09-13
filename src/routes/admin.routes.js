const express = require("express");
const router = express.Router();
const controller = require("../controllers/admin.controller");
const { requireTeacherOnly, requireAdminLevel } = require("../middleware/rbac.middleware");

router.get(
  "/student-activity",
  requireAdminLevel,
  controller.listStudentActivity,
);

// Full user/PII export — Teacher only, not even Head of Assistants.
router.get("/export-users", requireTeacherOnly, controller.exportUsers);
router.get("/export-students", requireTeacherOnly, controller.exportStudents);

module.exports = router;
