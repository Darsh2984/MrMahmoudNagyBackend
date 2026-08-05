const express = require("express");

const router = express.Router();

const chapterController = require(
  "../controllers/chapter.controller"
);

const {
  requireAuth,
  requireAssistantPermission,
} = require(
  "../middleware/rbac.middleware"
);

// Global taxonomy reads.
router.get(
  "/",
  requireAuth,
  chapterController.listChapters
);

router.get(
  "/:chapterId",
  requireAuth,
  chapterController.getChapter
);

// Teacher and Head Assistant are allowed.
// Regular Assistants require
// canUploadResources.
router.post(
  "/",
  requireAssistantPermission(
    "canUploadResources"
  ),
  chapterController.createChapter
);

router.patch(
  "/:chapterId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  chapterController.updateChapter
);

router.delete(
  "/:chapterId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  chapterController.deleteChapter
);

module.exports = router;