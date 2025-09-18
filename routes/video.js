// routes/video.js
const express = require("express");
const Video = require("../models/Video");
const videoUpload = require("../middleware/videoUpload");
const router = express.Router();

// Upload Video
router.post("/", videoUpload.single("video"), async (req, res) => {
  try {
    const { title, yearId, unitId, chapterId, teacherId } = req.body;

    if (!req.file) return res.status(400).json({ msg: "❌ Video file required" });

    const video = new Video({
      title,
      videoUrl: `/uploads/videos/${req.file.filename}`,
      yearId,
      unitId,
      chapterId,
      teacherId
    });

    await video.save();
    res.json(video);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error uploading video", error: err.message });
  }
});

// List Videos by Year
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

// Delete Video
router.delete("/:id", async (req, res) => {
  try {
    await Video.findByIdAndDelete(req.params.id);
    res.json({ msg: "✅ Video deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting video", error: err.message });
  }
});

// Stream video (no direct download)
router.get("/stream/:id", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ msg: "Video not found" });

    const path = `.${video.videoUrl}`; // full path to file
    const fs = require("fs");
    const stat = fs.statSync(path);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(path, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
      };
      res.writeHead(200, head);
      fs.createReadStream(path).pipe(res);
    }
  } catch (err) {
    console.error("❌ Streaming error:", err.message);
    res.status(500).json({ msg: "❌ Error streaming video", error: err.message });
  }
});


module.exports = router;
