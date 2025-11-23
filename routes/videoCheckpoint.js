const express = require("express");
const router = express.Router();
const VideoCheckpoint = require("../models/VideoQuiz");

// =============================
// 🟢 Create or Update Checkpoint
// =============================
router.post("/", async (req, res) => {
  try {
    const { videoId, timeInSeconds, questionIds } = req.body;

    if (!videoId || !timeInSeconds || !questionIds?.length) {
      return res.status(400).json({ msg: "Missing required fields" });
    }

    const checkpoint = new VideoCheckpoint({
      videoId,
      timeInSeconds,
      questionIds,
    });

    await checkpoint.save();
    res.json({ msg: "✅ Checkpoint saved successfully", checkpoint });
  } catch (err) {
    console.error("❌ Error saving checkpoint:", err);
    res
      .status(500)
      .json({ msg: "❌ Error saving checkpoint", error: err.message });
  }
});

// =============================
// 🟢 Get all checkpoints for a video
// =============================
router.get("/:videoId", async (req, res) => {
  try {
    const checkpoints = await VideoCheckpoint.find({ videoId: req.params.videoId })
      .populate("videoId", "title videoUrl")
      .populate("questionIds", "imageUrl correctAnswer") // ✅ only existing fields
      .sort({ timeInSeconds: 1 });

    // ✅ Format for frontend (matches your React code)
    const formatted = checkpoints.map((cp) => ({
      _id: cp._id,
      videoId: cp.videoId,
      timeInSeconds: cp.timeInSeconds,
      questions: cp.questionIds.map((q) => ({
        imageUrl: q.imageUrl,
        correctAnswer: q.correctAnswer, // ✅ send correctAnswer directly
      })),
    }));

    res.json(formatted);
  } catch (err) {
    console.error("❌ Error fetching checkpoints:", err);
    res
      .status(500)
      .json({ msg: "❌ Error fetching checkpoints", error: err.message });
  }
});

// =============================
// 🟠 Delete a Checkpoint
// =============================
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await VideoCheckpoint.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ msg: "❌ Checkpoint not found" });
    }

    res.json({ msg: "✅ Checkpoint deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting checkpoint:", err);
    res
      .status(500)
      .json({ msg: "❌ Error deleting checkpoint", error: err.message });
  }
});

module.exports = router;
