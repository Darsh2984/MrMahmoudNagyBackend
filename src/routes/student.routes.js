const express = require("express");
const router = express.Router();
const studentController = require("../controllers/student.controller");
const { requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

router.get("/:studentId", requireAuth, studentController.getProfile);
router.get("/status/unassigned", requireAdminLevel, studentController.listUnassigned);

// Per spec req #11: onground/online is settable by Teacher or Head of Assistants only.
router.patch("/:studentId/attendance-mode", requireAdminLevel, studentController.setAttendanceMode);
router.patch("/:studentId", requireAdminLevel, studentController.updateStudent);
router.delete("/:studentId", requireAdminLevel, studentController.deleteStudent);

module.exports = router;
