const express = require("express");
const Material = require("../models/Material");
const Student = require("../models/User"); // ✅ needed for filtering
const { materialUpload } = require("../middleware/upload");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// ----------------- Upload PDF -----------------
router.post("/", materialUpload.single("file"), async (req, res) => {
  try {
    const { title, yearId, unitId, chapterId, teacherId } = req.body;

    if (!req.file) return res.status(400).json({ msg: "❌ PDF file required" });

    const material = new Material({
      title,
      fileUrl: `/uploads/materials/${req.file.filename}`,
      yearId,
      unitId,
      chapterId,
      teacherId,
    });

    await material.save();
    res.json(material);
  } catch (err) {
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

    // ✅ Fetch only materials of that year
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


// ----------------- Stream PDF -----------------
router.get("/stream/:id", async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ msg: "Material not found" });

    const filePath = path.join(__dirname, `..${material.fileUrl}`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ msg: "File not found on server" });
    }

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": stat.size,
      "Content-Disposition": "inline", // ✅ inline view, no download
    });

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error streaming PDF", error: err.message });
  }
});

// ----------------- Delete PDF -----------------
router.delete("/:id", async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ msg: "Material not found" });

    // delete from DB
    await Material.findByIdAndDelete(req.params.id);

    // delete file from disk
    const filePath = path.join(__dirname, `..${material.fileUrl}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ msg: "✅ Material deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting material", error: err.message });
  }
});

module.exports = router;
