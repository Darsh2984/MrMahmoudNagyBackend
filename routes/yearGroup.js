const express = require("express");
const router = express.Router();
const Year = require("../models/Year");
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

// ✅ Create Year
router.post("/year", async (req, res) => {
  try {
    let { name, teacherId } = req.body;

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const year = new Year({ name, teacherId });
    await year.save();
    res.json(year);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating year", error: err.message });
  }
});

// ✅ Get all Years for a Teacher (or Assistant)
router.get("/year/:teacherId", async (req, res) => {
  try {
    let teacherId = await resolveTeacherId(req.params.teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const years = await Year.find({ teacherId })
      .populate({
        path: "groups",
        populate: { path: "students", select: "name email" },
      });

    res.json(years);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching years", error: err.message });
  }
});

// ✅ Create Group inside a Year
router.post("/group", async (req, res) => {
  try {
    const { name, yearId } = req.body;
    const year = await Year.findById(yearId);

    if (!year) {
      return res.status(404).json({ msg: "❌ Year not found" });
    }

    const group = new Group({ name, yearId });
    await group.save();

    // Push group into Year.groups
    await Year.findByIdAndUpdate(yearId, { $push: { groups: group._id } });

    res.json(group);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating group", error: err.message });
  }
});

// ✅ Get Groups of a Year
router.get("/group/:yearId", async (req, res) => {
  try {
    const groups = await Group.find({ yearId: req.params.yearId }).populate("students");
    res.json(groups);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching groups", error: err.message });
  }
});

// ✅ Add multiple students to a group
router.post("/group/:groupId/add-student", async (req, res) => {
  try {
    const { studentIds } = req.body; // expects array of student IDs
    const group = await Group.findById(req.params.groupId).populate("yearId");

    if (!group) return res.status(404).json({ msg: "❌ Group not found" });

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ msg: "❌ No students provided" });
    }

    let addedStudents = [];
    let skippedStudents = [];

    for (const studentId of studentIds) {
      // check if student already belongs to another group
      const existingGroup = await Group.findOne({ students: studentId });
      if (existingGroup) {
        skippedStudents.push(studentId);
        continue;
      }

      // Add student to group
      group.students.push(studentId);

      // Update student with groupId + yearId
      await User.findByIdAndUpdate(studentId, {
        groupId: group._id,
        yearId: group.yearId,
      });

      addedStudents.push(studentId);
    }

    await group.save();

    res.json({
      msg: "✅ Students processed",
      groupId: group._id,
      yearId: group.yearId,
      addedStudents,
      skippedStudents,
    });
  } catch (err) {
    console.error("❌ Error adding students:", err);
    res.status(500).json({ msg: "❌ Error adding students", error: err.message });
  }
});

// ✅ Remove student from group
router.delete("/group/:groupId/remove-student/:studentId", async (req, res) => {
  try {
    const { groupId, studentId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ msg: "❌ Group not found" });

    // Remove student from group
    group.students = group.students.filter((s) => s.toString() !== studentId);
    await group.save();

    // Clear student's groupId & yearId
    await User.findByIdAndUpdate(studentId, {
      groupId: null,
      yearId: null,
    });

    res.json({ msg: "✅ Student removed from group", group });
  } catch (err) {
    console.error("❌ Error removing student:", err);
    res.status(500).json({ msg: "❌ Error removing student", error: err.message });
  }
});

// ✅ Get all students in a specific group
router.get("/group/:groupId/students", async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate("students", "name email role");

    if (!group) return res.status(404).json({ msg: "❌ Group not found" });

    res.json(group.students);
  } catch (err) {
    console.error("❌ Error fetching group students:", err.message);
    res.status(500).json({ msg: "❌ Error fetching students", error: err.message });
  }
});

// ✅ Get the Year of a specific student
router.get("/student/:studentId/year", async (req, res) => {
  try {
    const group = await Group.findOne({ students: req.params.studentId }).populate("yearId", "name teacherId");

    if (!group) {
      return res.status(404).json({ msg: "❌ Student is not assigned to any group" });
    }

    res.json({
      yearId: group.yearId,
      groupId: group._id,
      teacherId: group.yearId.teacherId,
    });
  } catch (err) {
    console.error("❌ Error fetching student year:", err.message);
    res.status(500).json({ msg: "❌ Error fetching student year", error: err.message });
  }
});


// Update entire list of zoom links for a year
router.put("/year/:yearId/zoom", async (req, res) => {
  try {
    const { yearId } = req.params;
    const { zoomLinks } = req.body; // array of {title, link}

    const year = await Year.findByIdAndUpdate(
      yearId,
      { zoomLinks },
      { new: true }
    );

    if (!year) return res.status(404).json({ msg: "❌ Year not found" });
    res.json(year);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error updating Zoom links", error: err.message });
  }
});

// GET – fetch zoom links
router.get("/year/:yearId/zoom", async (req, res) => {
  try {
    const { yearId } = req.params;
    const year = await Year.findById(yearId);

    if (!year) return res.status(404).json({ msg: "❌ Year not found" });
    res.json({ zoomLinks: year.zoomLinks || [] });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching Zoom links", error: err.message });
  }
});


module.exports = router;
