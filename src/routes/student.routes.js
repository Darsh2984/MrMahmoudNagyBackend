const express = require("express");
const router = express.Router();

const studentController = require("../controllers/student.controller");

const {
  requireAuth,
  requireAdminLevel,
  requireRole,
} = require("../middleware/rbac.middleware");

// Static routes must be before "/:studentId".
router.get(
  "/status/unassigned",
  requireAdminLevel,
  studentController.listUnassigned
);

router.patch(
  "/:studentId/attendance-mode",
  requireAdminLevel,
  studentController.setAttendanceMode
);

router.get(
  "/:studentId",
  requireAuth,
  studentController.getProfile
);

router.patch(
  "/:studentId",
  requireRole("TEACHER", "ASSISTANT"),
  studentController.updateStudent
);

router.delete(
  "/:studentId",
  requireAdminLevel,
  studentController.deleteStudent
);

module.exports = router;