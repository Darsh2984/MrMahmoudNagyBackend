const express = require("express");
const axios = require("axios");
const Question = require("../models/Question");
const { questionUpload } = require("../middleware/upload");

const router = express.Router();

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE; // e.g. "studentfiles"
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;     // from Bunny dashboard
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com"; // your storage hostname

// ---------------- CREATE QUESTION ----------------
router.post("/question", questionUpload.single("image"), async (req, res) => {
  try {
    const { correctAnswer, unitId, chapterId, teacherId, yearId } = req.body;

    if (!req.file || !correctAnswer || !unitId || !chapterId || !teacherId || !yearId) {
      return res.status(400).json({ msg: "❌ Missing required fields" });
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

    const cdnUrl = `https://layth-eg.b-cdn.net/${path}`;

    const question = new Question({
      imageUrl: cdnUrl,
      correctAnswer,
      unitId,
      chapterId,
      teacherId,
      yearId, // ✅ save yearId
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
    const questions = await Question.find({ teacherId: req.params.teacherId })
      .populate("yearId", "name")
      .populate("unitId", "name")
      .populate("chapterId", "name");

    res.json(questions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching questions", error: err.message });
  }
});

// routes/question.js
router.get("/questions/:teacherId/:yearId", async (req, res) => {
  try {
    const { teacherId, yearId } = req.params;
    const questions = await Question.find({ teacherId, yearId })
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
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ msg: "❌ Question not found" });

    // Delete from Bunny
    const path = question.imageUrl.split(".b-cdn.net/")[1]; // e.g. "questions/filename.png"
    const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;
    await axios.delete(deleteUrl, {
      headers: { AccessKey: BUNNY_ACCESS_KEY },
    });

    // Delete from DB
    await Question.findByIdAndDelete(req.params.id);

    res.json({ msg: "✅ Question deleted" });
  } catch (err) {
    console.error("❌ Error deleting question:", err.message);
    res.status(500).json({ msg: "❌ Error deleting question", error: err.message });
  }
});

module.exports = router;
