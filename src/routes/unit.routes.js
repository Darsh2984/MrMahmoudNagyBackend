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

/*
 * Year-scoped content.
 *
 * New content structure:
 * Year -> Unit -> Chapter -> Resources
 *
 * The /year/:yearId route must stay before /:unitId.
 */
router.get(
  "/year/:yearId",
  requireAuth,
  unitController.listUnitsByYear
);

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