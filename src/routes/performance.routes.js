const express = require("express");
const router = express.Router();
const controller = require("../controllers/performance.controller");
const {
  requireAuth,
  requireRole,
} = require("../middleware/rbac.middleware");

// Static routes must come before parameterized routes.
router.get(
  "/export/reports/:groupId",
  requireRole("TEACHER", "ASSISTANT"),
  controller.exportStudentReports
);

router.get(
  "/export/:groupId",
  requireRole("TEACHER", "ASSISTANT"),
  controller.exportGroupPerformance
);

router.get(
  "/:groupId/:studentId",
  requireAuth,
  controller.getStudentPerformance
);

module.exports = router;
