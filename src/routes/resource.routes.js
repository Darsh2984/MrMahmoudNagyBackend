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
 * Direct browser-to-R2 upload.
 *
 * 1. POST /api/resources/direct-upload/start
 *    Backend returns a signed R2 PUT URL.
 *
 * 2. Browser uploads the file directly to R2.
 *
 * 3. POST /api/resources/direct-upload/complete
 *    Backend verifies the object exists and saves
 *    the Material/Video database record.
 */
router.post(
  "/direct-upload/start",
  requireAssistantPermission(
    "canUploadResources"
  ),
  resourceController.startDirectUpload
);

router.post(
  "/direct-upload/complete",
  requireAssistantPermission(
    "canUploadResources"
  ),
  resourceController.completeDirectUpload
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
 * Legacy/small Material upload.
 *
 * Normal upload:
 * multipart/form-data
 * sourceType = UPLOAD
 * file = uploaded file
 *
 * Existing R2 object:
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
 * Legacy/small Video upload.
 *
 * For large videos, use:
 * /direct-upload/start
 * /direct-upload/complete
 */
router.post(
  "/video",
  requireAssistantPermission(
    "canUploadResources"
  ),
  videoUpload.single("file"),
  resourceController.createVideo
);

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