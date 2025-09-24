const express = require("express");
const router = express.Router();
const School = require("../models/School");
const User = require("../models/User");
const Session = require("../models/Session");


// ----------------- Helper: Resolve Teacher ID -----------------
async function resolveTeacherId(teacherId) {
  const user = await User.findById(teacherId);
  if (!user) return null;

  // If assistant → map to real teacher
  if (user.assistantOf) {
    return user.assistantOf;
  }
  return user._id;
}

// ✅ Create School
router.post("/", async (req, res) => {
  try {
    let { name, teacherId } = req.body;
    if (!name || !teacherId) {
      return res.status(400).json({ msg: "❌ Missing required fields" });
    }

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

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

// ✅ Get all schools for a teacher (or assistant)
router.get("/:teacherId", async (req, res) => {
  try {
    let teacherId = await resolveTeacherId(req.params.teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const schools = await School.find({ teacherId });
    res.json(schools);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching schools", error: err.message });
  }
});

// Get all sessions for a specific group
router.get("/group/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;

    const sessions = await Session.find({ groupId })
      .populate("attendance.studentId", "name email") // optional: populate student info
      .sort({ createdAt: -1 });

    res.json(sessions);
  } catch (err) {
    console.error("❌ Error fetching sessions:", err);
    res.status(500).json({ msg: "❌ Failed to fetch sessions", error: err.message });
  }
});

// ✅ Delete School (only by teacher/assistant of that teacher)
router.delete("/:id/:teacherId", async (req, res) => {
  try {
    const { id, teacherId } = req.params;
    const resolvedTeacherId = await resolveTeacherId(teacherId);

    if (!resolvedTeacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const school = await School.findById(id);
    if (!school) {
      return res.status(404).json({ msg: "❌ School not found" });
    }

    // ensure ownership
    if (school.teacherId.toString() !== resolvedTeacherId.toString()) {
      return res.status(403).json({ msg: "❌ Not authorized to delete this school" });
    }

    await School.findByIdAndDelete(id);
    res.json({ msg: "✅ School deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting school", error: err.message });
  }
});

module.exports = router;
