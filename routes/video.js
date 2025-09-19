const express = require("express");
const Video = require("../models/Video");
const { videoUpload } = require("../middleware/upload"); // ✅ fixed
const router = express.Router();
const fs = require("fs");
const path = require("path");

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
      teacherId,
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
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ msg: "Video not found" });

    // remove from DB
    await Video.findByIdAndDelete(req.params.id);

    // remove file from disk
    const filePath = path.join(__dirname, `..${video.videoUrl}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ msg: "✅ Video deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting video", error: err.message });
  }
});

// Stream video (supports range requests)
router.get("/stream/:id", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ msg: "Video not found" });

    const filePath = path.join(__dirname, `..${video.videoUrl}`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ msg: "File not found on server" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
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
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error("❌ Streaming error:", err.message);
    res.status(500).json({ msg: "❌ Error streaming video", error: err.message });
  }
});

module.exports = router;
