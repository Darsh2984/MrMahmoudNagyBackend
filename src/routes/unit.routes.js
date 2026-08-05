const express = require("express");

const router = express.Router();

const unitController = require(
  "../controllers/unit.controller"
);

const {
  requireAuth,
  requireAssistantPermission,
} = require(
  "../middleware/rbac.middleware"
);

// Global taxonomy read.
// Units are no longer related to Years.
router.get(
  "/",
  requireAuth,
  unitController.listUnits
);

router.get(
  "/:unitId",
  requireAuth,
  unitController.getUnit
);

// Teacher/Head are allowed.
// A regular Assistant requires
// canUploadResources.
router.post(
  "/",
  requireAssistantPermission(
    "canUploadResources"
  ),
  unitController.createUnit
);

router.patch(
  "/:unitId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  unitController.updateUnit
);

router.delete(
  "/:unitId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  unitController.deleteUnit
);

module.exports = router;