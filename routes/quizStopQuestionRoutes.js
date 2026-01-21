const express = require("express");
const axios = require("axios");
const QuizStopQuestion = require("../models/QuizStopQuestion");
const User = require("../models/User");
const { questionUpload } = require("../middleware/upload");

const router = express.Router();

const BUNNY_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_HOST = "https://uk.storage.bunnycdn.com";

// ----------------- Map Assistants -----------------
async function resolveTeacherId(id) {
  const user = await User.findById(id);
  if (!user) return null;
  return user.assistantOf ? user.assistantOf : user._id;
}

// ---------------- CREATE QUIZ-STOP QUESTION ----------------
router.post("/question", questionUpload.single("image"), async (req, res) => {
  try {
    let { correctAnswer, unitId, chapterId, teacherId, yearId } = req.body;

    if (!req.file || !correctAnswer || !unitId || !chapterId || !teacherId || !yearId) {
      return res.status(400).json({ msg: "Missing fields" });
    }

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) return res.status(404).json({ msg: "Teacher not found" });

    // Upload to Bunny
    const fileName = Date.now() + "-" + req.file.originalname;
    const path = `quiz-stops/${fileName}`;
    const uploadUrl = `${BUNNY_HOST}/${BUNNY_ZONE}/${path}`;

    await axios.put(uploadUrl, req.file.buffer, {
      headers: {
        AccessKey: BUNNY_KEY,
        "Content-Type": "application/octet-stream",
      },
    });

    const cdnUrl = `https://cdn.layth-eg.com/${path}`;

    const q = new QuizStopQuestion({
      imageUrl: cdnUrl,
      correctAnswer,
      unitId,
      chapterId,
      teacherId,
      yearId,
    });

    await q.save();
    res.json(q);
  } catch (err) {
    console.error("QuizStop Error:", err.message);
    res.status(500).json({ msg: "Error", error: err.message });
  }
});

// GET Questions by Teacher
router.get("/questions/:teacherId", async (req, res) => {
  try {
    let teacherId = await resolveTeacherId(req.params.teacherId);
    const questions = await QuizStopQuestion.find({ teacherId })
      .populate("yearId", "name")
      .populate("unitId", "name")
      .populate("chapterId", "name");

    res.json(questions);
  } catch (err) {
    res.status(500).json({ msg: "Error", error: err.message });
  }
});

// GET Quiz Stop Questions filtered by Unit + Year
router.get("/questions/unit/:unitId/:yearId", async (req, res) => {
  try {
    const { unitId, yearId } = req.params;

    const questions = await QuizStopQuestion.find({ unitId, yearId })
      .populate("yearId", "name")
      .populate("unitId", "name")
      .populate("chapterId", "name");

    res.json(questions);
  } catch (err) {
    console.error("❌ Error fetching quiz stop questions by unit:", err.message);
    res.status(500).json({ msg: "Error fetching quiz stop questions", error: err.message });
  }
});


// DELETE
router.delete("/question/:id/:teacherId", async (req, res) => {
  try {
    const { id, teacherId } = req.params;
    const resolved = await resolveTeacherId(teacherId);

    const q = await QuizStopQuestion.findById(id);
    if (!q) return res.status(404).json({ msg: "Not found" });

    if (q.teacherId.toString() !== resolved.toString())
      return res.status(403).json({ msg: "Not allowed" });

    const path = q.imageUrl.split(".b-cdn.net/")[1];
    const deleteUrl = `${BUNNY_HOST}/${BUNNY_ZONE}/${path}`;

    await axios.delete(deleteUrl, { headers: { AccessKey: BUNNY_KEY } });

    await QuizStopQuestion.findByIdAndDelete(id);

    res.json({ msg: "Deleted" });
  } catch (err) {
    res.status(500).json({ msg: "Error", error: err.message });
  }
});

module.exports = router;
