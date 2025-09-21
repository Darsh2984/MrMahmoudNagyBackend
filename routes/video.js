const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const Video = require("../models/Video");
const { videoUpload } = require("../middleware/upload");

const router = express.Router();

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com"; // region host

// ----------------- Upload Video -----------------
router.post("/", videoUpload.single("video"), async (req, res) => {
  try {
    const { title, yearId, unitId, chapterId, teacherId } = req.body;
    if (!req.file) return res.status(400).json({ msg: "❌ Video file required" });

    const fileName = Date.now() + "-" + req.file.originalname;
    const storagePath = `videos/${fileName}`;
    const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;

    // ✅ Stream the video instead of loading it into memory
    const stream = fs.createReadStream(req.file.path);

    await axios.put(uploadUrl, stream, {
      headers: {
        AccessKey: BUNNY_ACCESS_KEY,
        "Content-Type": "application/octet-stream",
      },
      maxBodyLength: Infinity,
    });

    // ✅ Clean up local file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("⚠️ Failed to remove temp file:", err.message);
    });

    const cdnUrl = `https://layth-eg.b-cdn.net/${storagePath}`;

    const video = new Video({
      title,
      videoUrl: cdnUrl, // ✅ Bunny CDN link
      yearId,
      unitId,
      chapterId,
      teacherId,
    });

    await video.save();
    res.json(video);
  } catch (err) {
    console.error("❌ Error uploading video:", err.message);
    res.status(500).json({ msg: "❌ Error uploading video", error: err.message });
  }
});

// ----------------- List Videos by Year -----------------
router.get("/year/:yearId", async (req, res) => {
  try {
    const videos = await Video.find({ yearId: req.params.yearId })
      .populate("unitId", "name")
      .populate("chapterId", "name")
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    res.json(videos);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching videos", error: err.message });
  }
});

// ----------------- Delete Video -----------------
router.delete("/:id", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ msg: "Video not found" });

    // Delete from Bunny
    const storagePath = video.videoUrl.split(".b-cdn.net/")[1]; // e.g. "videos/filename.mp4"
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

module.exports = router;
