const express = require("express");

const router = express.Router();

const resourceController = require(
  "../controllers/resource.controller"
);

const {
  requireAuth,
  requireAssistantPermission,
} = require(
  "../middleware/rbac.middleware"
);

const {
  materialUpload,
  videoUpload,
} = require(
  "../middleware/upload.middleware"
);

/**
 * Viewer endpoint.
 *
 * Examples:
 * GET /api/resources/view/material/:resourceId
 * GET /api/resources/view/video/:resourceId
 */
router.get(
  "/view/:kind/:resourceId",
  requireAuth,
  resourceController.getResourceViewerData
);

router.post(
  "/material",
  requireAssistantPermission(
    "canUploadResources"
  ),
  materialUpload.single("file"),
  resourceController.createMaterial
);

router.post(
  "/video",
  requireAssistantPermission(
    "canUploadResources"
  ),
  videoUpload.single("file"),
  resourceController.createVideo
);

/**
 * File is optional during update.
 * Sending only title changes the title.
 * Sending title + file replaces the file.
 */
router.patch(
  "/material/:materialId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  materialUpload.single("file"),
  resourceController.updateMaterial
);

router.patch(
  "/video/:videoId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  videoUpload.single("file"),
  resourceController.updateVideo
);

router.delete(
  "/material/:materialId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  resourceController.deleteMaterial
);

router.delete(
  "/video/:videoId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  resourceController.deleteVideo
);

module.exports = router;