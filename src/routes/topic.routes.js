const express = require("express");

const router = express.Router();

const topicController = require(
  "../controllers/topic.controller"
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
  topicController.listTopics
);

router.get(
  "/:topicId",
  requireAuth,
  topicController.getTopic
);

// Teacher and Head Assistant are allowed.
// Regular Assistants require
// canUploadResources.
router.post(
  "/",
  requireAssistantPermission(
    "canUploadResources"
  ),
  topicController.createTopic
);

router.patch(
  "/:topicId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  topicController.updateTopic
);

router.delete(
  "/:topicId",
  requireAssistantPermission(
    "canUploadResources"
  ),
  topicController.deleteTopic
);

module.exports = router;