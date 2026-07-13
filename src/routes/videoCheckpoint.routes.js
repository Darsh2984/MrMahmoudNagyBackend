const express = require("express");
const router = express.Router();
const controller = require("../controllers/videoCheckpoint.controller");
const { requireAuth, requireAssistantPermission } = require("../middleware/rbac.middleware");

router.get("/:videoId", requireAuth, controller.listForVideo);
router.post("/", requireAssistantPermission("canUploadResources"), controller.createCheckpoint);
router.delete("/:checkpointId", requireAssistantPermission("canUploadResources"), controller.deleteCheckpoint);

module.exports = router;
