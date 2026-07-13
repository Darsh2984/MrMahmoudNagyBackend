const express = require("express");
const router = express.Router();
const resourceController = require("../controllers/resource.controller");
const { requireAssistantPermission } = require("../middleware/rbac.middleware");
const { materialUpload, videoUpload } = require("../middleware/upload.middleware");

router.post(
  "/material",
  requireAssistantPermission("canUploadResources"),
  materialUpload.single("file"),
  resourceController.createMaterial
);

router.post(
  "/video",
  requireAssistantPermission("canUploadResources"),
  videoUpload.single("file"),
  resourceController.createVideo
);

router.delete("/material/:materialId", requireAssistantPermission("canUploadResources"), resourceController.deleteMaterial);
router.delete("/video/:videoId", requireAssistantPermission("canUploadResources"), resourceController.deleteVideo);

module.exports = router;
