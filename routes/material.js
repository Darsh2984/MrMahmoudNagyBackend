const express = require("express");
const Material = require("../models/Material");
const User = require("../models/User");
const { materialUpload } = require("../middleware/upload");
const axios = require("axios");

const router = express.Router();

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE; // e.g. "studentfiles"
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;     // from Bunny dashboard
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com"; // your storage hostname
const BUNNY_CDN_HOST = "https://cdn.layth-eg.com"; // your CDN hostname

// ----------------- Helper: Resolve Teacher ID -----------------
async function resolveTeacherId(teacherId) {
  const user = await User.findById(teacherId);
  if (!user) return null;

  // If this is an assistant, return the main teacher’s ID
  if (user.assistantOf) {
    return user.assistantOf;
  }

  return user._id; // main teacher
}

// ----------------- Upload PDF -----------------
router.post("/", materialUpload.single("file"), async (req, res) => {
  try {
    let { title, yearId, unitId, chapterId, teacherId } = req.body;
    if (!req.file) return res.status(400).json({ msg: "❌ PDF file required" });

    // Resolve teacher ID (assistant → teacher)
    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

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

    // Public CDN URL
    const cdnUrl = `${BUNNY_CDN_HOST}/${path}`;

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

// ----------------- Add Material by URL -----------------
router.post("/url", async (req, res) => {
  try {
    let { title, fileUrl, yearId, unitId, chapterId, teacherId } = req.body;
    if (!fileUrl) return res.status(400).json({ msg: "❌ PDF URL required" });

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

    const material = new Material({
      title,
      fileUrl, // ✅ teacher provided Bunny CDN link
      yearId,
      unitId,
      chapterId,
      teacherId,
    });

    await material.save();
    res.json(material);
  } catch (err) {
    console.error("❌ Error saving material URL:", err.message);
    res.status(500).json({ msg: "❌ Error saving material URL", error: err.message });
  }
});

// ----------------- Teacher: List PDFs by Year -----------------
router.get("/year/:yearId/teacher/:teacherId", async (req, res) => {
  try {
    let { teacherId, yearId } = req.params;

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

    const materials = await Material.find({ yearId, teacherId })
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
router.delete("/:id/teacher/:teacherId", async (req, res) => {
  try {
    let { id, teacherId } = req.params;

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

    const material = await Material.findById(id);
    if (!material) return res.status(404).json({ msg: "❌ Material not found" });

    // Ensure material belongs to this teacher
    if (material.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({ msg: "❌ Not authorized to delete this material" });
    }

    // Remove from Bunny
    const path = material.fileUrl.split(".b-cdn.net/")[1]; // e.g. "materials/filename.pdf"
    const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

    await axios.delete(deleteUrl, {
      headers: { AccessKey: BUNNY_ACCESS_KEY },
    });

    // Remove from DB
    await Material.findByIdAndDelete(id);

    res.json({ msg: "✅ Material deleted" });
  } catch (err) {
    console.error("❌ Error deleting material:", err.message);
    res.status(500).json({ msg: "❌ Error deleting material", error: err.message });
  }
});

module.exports = router;
