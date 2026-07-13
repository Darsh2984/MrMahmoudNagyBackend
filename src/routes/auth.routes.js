const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { requireTeacherOnly } = require("../middleware/rbac.middleware");

// Public
router.post("/register-student", authController.registerStudent);
router.post("/login", authController.login);
router.get("/lookup/:code", authController.lookupByAccessCode); // parent access-code lookup, read-only
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password/:token", authController.resetPassword);

// Teacher-only: assistant account lifecycle + head promotion/demotion
router.post("/create-assistant", requireTeacherOnly, authController.createAssistant);
router.post("/promote-head/:assistantId", requireTeacherOnly, authController.promoteToHead);
router.post("/demote-head/:assistantId", requireTeacherOnly, authController.demoteFromHead);

module.exports = router;
