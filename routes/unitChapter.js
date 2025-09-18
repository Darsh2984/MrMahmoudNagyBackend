const express = require("express");
const router = express.Router();
const Unit = require("../models/Unit");
const Chapter = require("../models/Chapter");

// ----------------- UNITS -----------------

// Create Unit
router.post("/unit", async (req, res) => {
  try {
    const { name, teacherId } = req.body;
    if (!name || !teacherId) return res.status(400).json({ msg: "Name and Teacher ID are required" });

    const unit = new Unit({ name, teacherId });
    await unit.save();
    res.json(unit);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating unit", error: err.message });
  }
});

// Get Units (with chapters)
router.get("/unit/:teacherId", async (req, res) => {
  try {
    const units = await Unit.find({ teacherId: req.params.teacherId })
      .populate("chapters");
    res.json(units);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching units", error: err.message });
  }
});

// Update Unit
router.put("/unit/:id", async (req, res) => {
  try {
    const { name } = req.body;
    const updated = await Unit.findByIdAndUpdate(req.params.id, { name }, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error updating unit", error: err.message });
  }
});

// Delete Unit (and its chapters)
router.delete("/unit/:id", async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) return res.status(404).json({ msg: "Unit not found" });

    // delete chapters under this unit
    await Chapter.deleteMany({ unitId: unit._id });

    // delete unit
    await unit.deleteOne();
    res.json({ msg: "✅ Unit and its chapters deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting unit", error: err.message });
  }
});

// ----------------- CHAPTERS -----------------

// Create Chapter
router.post("/chapter", async (req, res) => {
  try {
    const { name, unitId } = req.body;
    if (!name || !unitId) return res.status(400).json({ msg: "Name and Unit ID are required" });

    const chapter = new Chapter({ name, unitId });
    await chapter.save();

    // link chapter to unit
    await Unit.findByIdAndUpdate(unitId, { $push: { chapters: chapter._id } });

    res.json(chapter);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating chapter", error: err.message });
  }
});

// Update Chapter
router.put("/chapter/:id", async (req, res) => {
  try {
    const { name } = req.body;
    const updated = await Chapter.findByIdAndUpdate(req.params.id, { name }, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error updating chapter", error: err.message });
  }
});

// Delete Chapter
router.delete("/chapter/:id", async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id);
    if (!chapter) return res.status(404).json({ msg: "Chapter not found" });

    // remove reference from unit
    await Unit.findByIdAndUpdate(chapter.unitId, { $pull: { chapters: chapter._id } });

    // delete chapter
    await chapter.deleteOne();

    res.json({ msg: "✅ Chapter deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting chapter", error: err.message });
  }
});

// Get Chapters of a Unit
router.get("/chapter/:unitId", async (req, res) => {
  try {
    const chapters = await Chapter.find({ unitId: req.params.unitId });
    res.json(chapters);
  } catch (err) {
    console.error("❌ Error fetching chapters:", err.message);
    res.status(500).json({ msg: "❌ Error fetching chapters", error: err.message });
  }
});

module.exports = router;
