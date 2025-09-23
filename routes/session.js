const express = require("express");
const router = express.Router();
const Session = require("../models/Session");
const Group = require("../models/Group");
const User = require("../models/User");

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

// ✅ Create a session
router.post("/session", async (req, res) => {
  try {
    let { title, teacherId, yearId, groupId } = req.body;

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    // make sure group belongs to that year
    const group = await Group.findOne({ _id: groupId, yearId }).populate("students");
    if (!group) return res.status(404).json({ msg: "❌ Group not found under this Year" });

    // prepare attendance list
    const attendance = group.students.map((student) => ({
      studentId: student._id,
      status: "Absent",
    }));

    const session = new Session({ title, teacherId, yearId, groupId, attendance });
    await session.save();

    // ✅ populate group and students before sending back
    const saved = await Session.findById(session._id)
      .populate("groupId")
      .populate("attendance.studentId");

    res.json(saved);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating session", error: err.message });
  }
});

// ✅ Update attendance
router.put("/session/:id/attendance", async (req, res) => {
  try {
    const { attendance } = req.body; // [{ studentId, status }]
    const session = await Session.findById(req.params.id);

    if (!session) return res.status(404).json({ msg: "Session not found" });

    session.attendance = attendance;
    await session.save();

    res.json({ msg: "✅ Attendance updated", session });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error updating attendance", error: err.message });
  }
});

// ✅ Get sessions by Year (teacher or assistant)
router.get("/session/year/:yearId/:teacherId", async (req, res) => {
  try {
    let teacherId = await resolveTeacherId(req.params.teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const sessions = await Session.find({ yearId: req.params.yearId, teacherId })
      .populate("groupId")
      .populate("attendance.studentId");

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching sessions by year", error: err.message });
  }
});

// ✅ Get sessions for a group (teacher or assistant)
router.get("/session/group/:groupId/:teacherId", async (req, res) => {
  try {
    let teacherId = await resolveTeacherId(req.params.teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const sessions = await Session.find({ groupId: req.params.groupId, teacherId })
      .populate("attendance.studentId");

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching sessions", error: err.message });
  }
});

// ✅ Get a single session by ID
router.get("/session/:id", async (req, res) => {
  try {
    const session = await Session.findById(req.params.id)
      .populate("groupId")
      .populate("attendance.studentId");

    if (!session) {
      return res.status(404).json({ msg: "❌ Session not found" });
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching session", error: err.message });
  }
});

// ✅ Get sessions for a specific student
router.get("/sessions/student/:studentId", async (req, res) => {
  try {
    const sessions = await Session.find({
      "attendance.studentId": req.params.studentId,
    })
      .populate("groupId")
      .populate("attendance.studentId");

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching student sessions", error: err.message });
  }
});

module.exports = router;
