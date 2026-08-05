const express = require("express");

const router = express.Router();

const statsController =
  require("../controllers/assistantStats.controller");

const {
  requireAdminLevel,
  requireRole,
} = require("../middleware/rbac.middleware");

router.get(
  "/all",
  requireAdminLevel,
  statsController.getAllAssistantStats,
);

router.get(
  "/me",
  requireRole("ASSISTANT"),
  (req, res, next) => {
    req.params.assistantId =
      req.user.id;

    next();
  },
  statsController.getAssistantStats,
);

router.get(
  "/:assistantId",
  requireAdminLevel,
  statsController.getAssistantStats,
);

module.exports = router;