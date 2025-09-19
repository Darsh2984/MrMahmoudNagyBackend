const express = require("express");
const Material = require("../models/Material");
const Student = require("../models/User");
const { materialUpload } = require("../middleware/upload");
const axios = require("axios");

const router = express.Router();

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE; // e.g. "studentfiles"
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;     // from Bunny dashboard
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com"; // your hostname

// ----------------- Upload PDF -----------------
router.post("/", materialUpload.single("file"), async (req, res) => {
  try {
    const { title, yearId, unitId, chapterId, teacherId } = req.body;
    if (!req.file) return res.status(400).json({ msg: "❌ PDF file required" });

    // Unique file path inside Bunny
    const fileName = Date.now() + "-" + req.file.originalname;
    const path = `materials/${fileName}`;
    const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

    // Upload file buffer to Bunny
    await axios.put(uploadUrl, req.file.buffer, {
      headers: {
        AccessKey: BUNNY_ACCESS_KEY,
        "Content-Type": "application/octet-stream",
      },
      maxBodyLength: Infinity,
    });

    // Public CDN URL (what students/teachers use)
    const cdnUrl = `https://layth-eg.b-cdn.net/${path}`;

    // Save in DB
    const material = new Material({
      title,
      fileUrl: cdnUrl,
      yearId,
      unitId,
      chapterId,
      teacherId,
    });

    await material.save();
    res.json(material);
  } catch (err) {
    console.error("❌ Error uploading material:", err.message);
    res.status(500).json({ msg: "❌ Error uploading material", error: err.message });
  }
});

// ----------------- Teacher: List PDFs by Year -----------------
router.get("/year/:yearId", async (req, res) => {
  try {
    const materials = await Material.find({ yearId: req.params.yearId })
      .populate("unitId", "name")
      .populate("chapterId", "name")
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    res.json(materials);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching materials", error: err.message });
  }
});

// ----------------- Student: List PDFs by Year -----------------
router.get("/student/:studentId/year/:yearId", async (req, res) => {
  try {
    const { yearId } = req.params;
    const materials = await Material.find({ yearId })
      .populate("unitId", "name")
      .populate("chapterId", "name")
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    res.json(materials);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching student materials", error: err.message });
  }
});

// ----------------- Delete PDF -----------------
router.delete("/:id", async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ msg: "Material not found" });

    // Remove from Bunny
    const path = material.fileUrl.split(".b-cdn.net/")[1]; // e.g. "materials/filename.pdf"
    const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

    await axios.delete(deleteUrl, {
      headers: { AccessKey: BUNNY_ACCESS_KEY },
    });

    // Remove from DB
    await Material.findByIdAndDelete(req.params.id);

    res.json({ msg: "✅ Material deleted" });
  } catch (err) {
    console.error("❌ Error deleting material:", err.message);
    res.status(500).json({ msg: "❌ Error deleting material", error: err.message });
  }
});

module.exports = router;
