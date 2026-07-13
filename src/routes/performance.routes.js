const express = require("express");
const router = express.Router();
const controller = require("../controllers/performance.controller");
const { requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

router.get("/:groupId/:studentId", requireAuth, controller.getStudentPerformance);
router.get("/export/:groupId", requireAdminLevel, controller.exportGroupPerformance);

module.exports = router;
