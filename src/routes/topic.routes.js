const express = require("express");
const router = express.Router();
const topicController = require("../controllers/topic.controller");
const { requireAuth, requireAssistantPermission } = require("../middleware/rbac.middleware");

// This is the main student-facing browse endpoint: GET /:topicId returns materials + videos.
router.get("/:topicId", requireAuth, topicController.getTopic);

router.post("/", requireAssistantPermission("canUploadResources"), topicController.createTopic);
router.patch("/:topicId", requireAssistantPermission("canUploadResources"), topicController.updateTopic);
router.delete("/:topicId", requireAssistantPermission("canUploadResources"), topicController.deleteTopic);

module.exports = router;
