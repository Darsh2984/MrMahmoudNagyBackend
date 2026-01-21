const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const User = require("../models/User");
const { questionUpload } = require("../middleware/upload");

const router = express.Router();

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE; // e.g. "studentfiles"
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;     // from Bunny dashboard
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com"; // your storage hostname

// ----------------- Helper: Resolve Teacher ID -----------------
async function resolveTeacherId(teacherId) {
  const user = await User.findById(teacherId);
  if (!user) return null;

  // If assistant → map to real teacher
  if (user.assistantOf) {
    return user.assistantOf;
  }
  return user._id;
}

// ---------------- CREATE QUESTION ----------------
router.post("/question", questionUpload.single("image"), async (req, res) => {
  try {
    let { correctAnswer, unitId, chapterId, teacherId, yearId } = req.body;

    if (!req.file || !correctAnswer || !unitId || !chapterId || !teacherId || !yearId) {
      return res.status(400).json({ msg: "❌ Missing required fields" });
    }

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const fileName = Date.now() + "-" + req.file.originalname;
    const path = `questions/${fileName}`;
    const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

    await axios.put(uploadUrl, req.file.buffer, {
      headers: {
        AccessKey: BUNNY_ACCESS_KEY,
        "Content-Type": "application/octet-stream",
      },
      maxBodyLength: Infinity,
    });

    const cdnUrl = `https://cdn.layth-eg.com/${path}`;

    const question = new Question({
      imageUrl: cdnUrl,
      correctAnswer,
      unitId,
      chapterId,
      teacherId,
      yearId,
    });

    await question.save();
    res.json(question);
  } catch (err) {
    console.error("❌ Error creating question:", err.message);
    res.status(500).json({ msg: "❌ Error creating question", error: err.message });
  }
});

// ---------------- GET ALL QUESTIONS ----------------
router.get("/questions/:teacherId", async (req, res) => {
  try {
    let teacherId = await resolveTeacherId(req.params.teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const questions = await Question.find({ teacherId })
      .populate("yearId", "name")
      .populate("unitId", "name")
      .populate("chapterId", "name");

    res.json(questions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching questions", error: err.message });
  }
});

// ---------------- GET QUESTIONS BY YEAR ----------------
router.get("/questions/:teacherId/:yearId", async (req, res) => {
  try {
    let { teacherId, yearId } = req.params;
    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const questions = await Question.find({ teacherId, yearId })
      .populate("unitId", "name")
      .populate("chapterId", "name");

    res.json(questions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching questions", error: err.message });
  }
});

// ---------------- GET QUESTIONS BY UNIT AND YEAR ----------------
router.get("/questions/unit/:unitId/:yearId", async (req, res) => {
  try {
    const { unitId, yearId } = req.params;

    const questions = await Question.find({ unitId, yearId })
      .populate("yearId", "name")
      .populate("unitId", "name")
      .populate("chapterId", "name");

    res.json(questions);
  } catch (err) {
    console.error("❌ Error fetching questions by unit:", err.message);
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
router.delete("/question/:id/:teacherId", async (req, res) => {
  try {
    const { id, teacherId } = req.params;
    const resolvedTeacherId = await resolveTeacherId(teacherId);
    if (!resolvedTeacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const question = await Question.findById(id);
    if (!question) return res.status(404).json({ msg: "❌ Question not found" });

    // ensure ownership
    if (question.teacherId.toString() !== resolvedTeacherId.toString()) {
      return res.status(403).json({ msg: "❌ Not authorized to delete this question" });
    }

    // Delete from Bunny
    const path = question.imageUrl.split(".b-cdn.net/")[1]; // e.g. "questions/filename.png"
    const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;
    await axios.delete(deleteUrl, {
      headers: { AccessKey: BUNNY_ACCESS_KEY },
    });

    // Delete from DB
    await Question.findByIdAndDelete(id);

    res.json({ msg: "✅ Question deleted" });
  } catch (err) {
    console.error("❌ Error deleting question:", err.message);
    res.status(500).json({ msg: "❌ Error deleting question", error: err.message });
  }
});

module.exports = router;
