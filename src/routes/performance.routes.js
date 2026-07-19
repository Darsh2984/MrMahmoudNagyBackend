const express = require("express");
const router = express.Router();
const controller = require("../controllers/performance.controller");
const {
  requireAuth,
  requireAdminLevel,
} = require("../middleware/rbac.middleware");

// Static routes must come before parameterized routes.
router.get(
  "/export/:groupId",
  requireAdminLevel,
  controller.exportGroupPerformance
);

router.get(
  "/:groupId/:studentId",
  requireAuth,
  controller.getStudentPerformance
);

module.exports = router;