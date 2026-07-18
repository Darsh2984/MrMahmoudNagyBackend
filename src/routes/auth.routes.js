const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { requireTeacherOnly, requireAuth, requireAdminLevel } = require("../middleware/rbac.middleware");

// Public
router.post("/register-student", authController.registerStudent);
router.post("/login", authController.login);
router.get("/lookup/:code", authController.lookupByAccessCode); // parent access-code lookup, read-only
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password/:token", authController.resetPassword);

// Authenticated — lets the frontend restore session state on app relaunch
router.get("/me", requireAuth, authController.getCurrentUser);

// Teacher-only: assistant account lifecycle + head promotion/demotion
router.post("/create-assistant", requireTeacherOnly, authController.createAssistant);
router.post("/promote-head/:assistantId", requireTeacherOnly, authController.promoteToHead);
router.post("/demote-head/:assistantId", requireTeacherOnly, authController.demoteFromHead);
router.delete("/assistants/:assistantId", requireTeacherOnly, authController.deleteAssistant);

// Teacher/Head: view + configure assistants (not account creation/removal)
router.get("/assistants", requireAdminLevel, authController.listAssistants);
router.patch("/assistants/:assistantId/permissions", requireAdminLevel, authController.updateAssistantPermissions);

module.exports = router;
