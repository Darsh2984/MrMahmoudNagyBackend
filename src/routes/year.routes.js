const express = require("express");
const router = express.Router();
const yearController = require("../controllers/year.controller");
const { requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

router.get("/mine", requireAuth, yearController.listMyYears);
router.get("/teacher/:teacherId", requireAuth, yearController.listYearsForTeacher);
router.get("/:yearId", requireAuth, yearController.getYear);
router.get("/:yearId/zoom", requireAuth, yearController.getZoomLinks);

router.post("/", requireAdminLevel, yearController.createYear);
router.patch("/:yearId", requireAdminLevel, yearController.updateYear);
router.delete("/:yearId", requireAdminLevel, yearController.deleteYear);
router.put("/:yearId/zoom", requireAdminLevel, yearController.updateZoomLinks);

module.exports = router;
