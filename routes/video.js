const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const Video = require("../models/Video");
const User = require("../models/User");
const { videoUpload } = require("../middleware/upload");

const router = express.Router();

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com"; // region host

// ----------------- Progress Tracker -----------------
let currentProgress = {};

// ----------------- Helper: Resolve Teacher ID -----------------
async function resolveTeacherId(teacherId) {
  const user = await User.findById(teacherId);
  if (!user) return null;
  return user.assistantOf || user._id;
}

// ----------------- Upload Video -----------------
router.post("/", videoUpload.single("video"), async (req, res) => {
  try {
    let { title, yearId, unitId, chapterId, teacherId, uploadId } = req.body;
    if (!req.file) return res.status(400).json({ msg: "❌ Video file required" });

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

    const fileName = Date.now() + "-" + req.file.originalname;
    const storagePath = `videos/${fileName}`;
    const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;

    // ✅ Track progress manually while streaming
    const fileSize = fs.statSync(req.file.path).size;
    currentProgress[uploadId] = 0;

    const stream = fs.createReadStream(req.file.path);
    let uploadedBytes = 0;

    stream.on("data", (chunk) => {
      uploadedBytes += chunk.length;
      currentProgress[uploadId] = Math.round((uploadedBytes / fileSize) * 100);
    });

    await axios.put(uploadUrl, stream, {
      headers: {
        AccessKey: BUNNY_ACCESS_KEY,
        "Content-Type": "application/octet-stream",
        "Content-Length": fileSize,
      },
      maxBodyLength: Infinity,
    });

    fs.unlink(req.file.path, (err) => {
      if (err) console.error("⚠️ Failed to remove temp file:", err.message);
    });

    const cdnUrl = `https://cdn.layth-eg.com/${storagePath}`;

    const video = new Video({
      title,
      videoUrl: cdnUrl,
      yearId,
      unitId,
      chapterId,
      teacherId,
    });

    await video.save();

    currentProgress[uploadId] = 100;
    setTimeout(() => delete currentProgress[uploadId], 10000);

    res.json(video);
  } catch (err) {
    console.error("❌ Error uploading video:", err.message);
    res.status(500).json({ msg: "❌ Error uploading video", error: err.message });
  }
});

// ----------------- Add Video by URL -----------------
router.post("/url", async (req, res) => {
  try {
    let { title, videoUrl, yearId, unitId, chapterId, teacherId } = req.body;
    if (!videoUrl) return res.status(400).json({ msg: "❌ Video URL required" });

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

    const video = new Video({
      title,
      videoUrl,
      yearId,
      unitId,
      chapterId,
      teacherId,
    });

    await video.save();
    res.json(video);
  } catch (err) {
    console.error("❌ Error saving video URL:", err.message);
    res.status(500).json({ msg: "❌ Error saving video URL", error: err.message });
  }
});

// ----------------- List Videos by Year -----------------
router.get("/year/:yearId", async (req, res) => {
  try {
    const videos = await Video.find({ yearId: req.params.yearId })
      .populate("yearId", "name") // 🟢 add this line
      .populate("unitId", "name")
      .populate("chapterId", "name")
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    res.json(videos);
  } catch (err) {
    console.error("❌ Error fetching videos:", err.message);
    res.status(500).json({ msg: "❌ Error fetching videos", error: err.message });
  }
});


// ----------------- Delete Video -----------------
router.delete("/:id", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ msg: "Video not found" });

    const storagePath = video.videoUrl.split(".b-cdn.net/")[1]; // "videos/filename.mp4"
    const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;

    await axios.delete(deleteUrl, {
      headers: { AccessKey: BUNNY_ACCESS_KEY },
    });

    await Video.findByIdAndDelete(req.params.id);

    res.json({ msg: "✅ Video deleted" });
  } catch (err) {
    console.error("❌ Error deleting video:", err.message);
    res.status(500).json({ msg: "❌ Error deleting video", error: err.message });
  }
});

// ----------------- Update Video URL -----------------
router.put("/:id", async (req, res) => {
  try {
    const { videoUrl, title } = req.body;

    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ msg: "Video not found" });

    if (videoUrl !== undefined) video.videoUrl = videoUrl;
    if (title !== undefined) video.title = title;

    await video.save();

    res.json({ msg: "Video updated successfully", video });

  } catch (err) {
    console.error("UPDATE VIDEO ERROR:", err);
    res.status(500).json({
      msg: "Error updating video",
      error: err.message,
    });
  }
});

// ----------------- SSE Progress -----------------
router.get("/progress/:uploadId", (req, res) => {
  const { uploadId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(() => {
    const percent = currentProgress[uploadId] || 0;
    res.write(`data: ${JSON.stringify({ progress: percent })}\n\n`);
  }, 1000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

module.exports = router;
