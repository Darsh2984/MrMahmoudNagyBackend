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
 * Multipart browser-to-R2 upload.
 *
 * This is the production-safe flow for very large videos.
 *
 * 1. POST /api/resources/multipart/start
 *    Creates an R2 multipart upload and returns uploadId + objectKey.
 *
 * 2. POST /api/resources/multipart/sign-part
 *    Returns a signed PUT URL for one file part.
 *
 * 3. Browser uploads the part directly to R2.
 *
 * 4. POST /api/resources/multipart/complete
 *    Completes the R2 upload and saves the DB record.
 *
 * 5. POST /api/resources/multipart/abort
 *    Cancels an unfinished multipart upload.
 */
router.post(
  "/multipart/start",
  requireAssistantPermission(
    "canUploadResources"
  ),
  resourceController.startMultipartUpload
);

router.post(
  "/multipart/sign-part",
  requireAssistantPermission(
    "canUploadResources"
  ),
  resourceController.signMultipartPart
);

router.post(
  "/multipart/complete",
  requireAssistantPermission(
    "canUploadResources"
  ),
  resourceController.completeMultipartUpload
);

router.post(
  "/multipart/abort",
  requireAssistantPermission(
    "canUploadResources"
  ),
  resourceController.abortMultipartUpload
);

/**
 * Direct browser-to-R2 upload.
 *
 * Kept for small/medium uploads, but large videos should use multipart.
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
 * /multipart/start
 * /multipart/sign-part
 * /multipart/complete
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