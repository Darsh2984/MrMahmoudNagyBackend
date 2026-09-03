const express = require("express");

const router = express.Router();

const aiCorrectionController = require(
  "../controllers/aiCorrection.controller"
);

const {
  aiCorrectionUpload,
} = require(
  "../middleware/aiCorrectionUpload.middleware"
);

const {
  requireTeacherOnly,
} = require("../middleware/rbac.middleware");

router.post(
  "/correct-paper",
  requireTeacherOnly,
  aiCorrectionUpload,
  aiCorrectionController.correctPaper
);

module.exports = router;