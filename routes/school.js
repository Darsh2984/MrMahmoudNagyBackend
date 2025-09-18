const express = require("express");
const router = express.Router();
const School = require("../models/School");

// ✅ Create School
router.post("/", async (req, res) => {
  try {
    const { name, teacherId } = req.body;
    if (!name || !teacherId) return res.status(400).json({ msg: "❌ Missing required fields" });

    const school = new School({ name, teacherId });
    await school.save();
    res.json(school);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating school", error: err.message });
  }
});

// Get all schools (for registration dropdown)
router.get("/all", async (req, res) => {
  try {
    const schools = await School.find().select("_id name");
    res.json(schools);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching schools", error: err.message });
  }
});

// ✅ Get all schools for a teacher
router.get("/:teacherId", async (req, res) => {
  try {
    const schools = await School.find({ teacherId: req.params.teacherId });
    res.json(schools);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching schools", error: err.message });
  }
});

// ✅ Delete School
router.delete("/:id", async (req, res) => {
  try {
    await School.findByIdAndDelete(req.params.id);
    res.json({ msg: "✅ School deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting school", error: err.message });
  }
});



module.exports = router;
