const express = require("express");
const router = express.Router();
const chapterController = require("../controllers/chapter.controller");
const { requireAuth, requireAssistantPermission } = require("../middleware/rbac.middleware");

router.get("/:chapterId", requireAuth, chapterController.getChapter);

router.post("/", requireAssistantPermission("canUploadResources"), chapterController.createChapter);
router.patch("/:chapterId", requireAssistantPermission("canUploadResources"), chapterController.updateChapter);
router.delete("/:chapterId", requireAssistantPermission("canUploadResources"), chapterController.deleteChapter);

module.exports = router;
