const express = require("express");
const router = express.Router();
const controller = require("../controllers/dashboardSummary.controller");
const { requireAdminLevel } = require("../middleware/rbac.middleware");

router.get("/teacher-summary", requireAdminLevel, controller.getTeacherSummary);

module.exports = router;
