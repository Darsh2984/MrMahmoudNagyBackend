const express = require("express");
const router = express.Router();
const studentController = require("../controllers/student.controller");
const { requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

router.get("/:studentId", requireAuth, studentController.getProfile);

// Per spec req #11: onground/online is settable by Teacher or Head of Assistants only.
router.patch("/:studentId/attendance-mode", requireAdminLevel, studentController.setAttendanceMode);

module.exports = router;
