const express = require("express");
const router = express.Router();
const Question = require("../models/Question");
const upload = require("../middleware/upload");
const { questionUpload } = require("../middleware/upload");

// ---------------- CREATE QUESTION ----------------
router.post("/question", questionUpload.single("image"), async (req, res) => {
  try {
    const { correctAnswer, unitId, chapterId, teacherId } = req.body;

    if (!req.file || !correctAnswer || !unitId || !chapterId || !teacherId) {
      return res.status(400).json({ msg: "❌ Missing required fields" });
    }

    const question = new Question({
      imageUrl: `/uploads/questions/${req.file.filename}`,
      correctAnswer,
      unitId,
      chapterId,
      teacherId,
    });

    await question.save();
    res.json(question);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating question", error: err.message });
  }
});


// ---------------- GET ALL QUESTIONS ----------------
router.get("/questions/:teacherId", async (req, res) => {
  try {
    const questions = await Question.find({ teacherId: req.params.teacherId })
      .populate("unitId", "name")
      .populate("chapterId", "name");
    res.json(questions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching questions", error: err.message });
  }
});

// ---------------- GET QUESTIONS BY CHAPTER ----------------
router.get("/questions/chapter/:chapterId", async (req, res) => {
  try {
    const questions = await Question.find({ chapterId: req.params.chapterId })
      .populate("unitId", "name")
      .populate("chapterId", "name");
    res.json(questions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching questions", error: err.message });
  }
});

// ---------------- DELETE QUESTION ----------------
router.delete("/question/:id", async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ msg: "✅ Question deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting question", error: err.message });
  }
});

module.exports = router;
