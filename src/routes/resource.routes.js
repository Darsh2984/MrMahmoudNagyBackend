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

/**
 * Create Material
 *
 * Normal upload:
 * multipart/form-data
 * sourceType = UPLOAD
 * file = uploaded file
 *
 * Existing R2 object:
 * multipart/form-data or normal body
 * sourceType = R2_EXISTING
 * objectKey = existing R2 key
 * no file required
 */
router.post(
  "/material",
  requireAssistantPermission(
    "canUploadResources"
  ),
  materialUpload.single("file"),
  resourceController.createMaterial
);

/**
 * Create Video
 *
 * Normal upload:
 * sourceType = UPLOAD
 * file = uploaded video
 *
 * Existing R2 object:
 * sourceType = R2_EXISTING
 * objectKey = existing R2 key
 * no file required
 */
router.post(
  "/video",
  requireAssistantPermission(
    "canUploadResources"
  ),
  videoUpload.single("file"),
  resourceController.createVideo
);

/**
 * Update Material
 *
 * Supported:
 * - title only
 * - title + replacement uploaded file
 * - title + existing R2 object key
 */
router.patch(
  "/material/:materialId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  materialUpload.single("file"),
  resourceController.updateMaterial
);

/**
 * Update Video
 *
 * Supported:
 * - title only
 * - title + replacement uploaded file
 * - title + existing R2 object key
 */
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