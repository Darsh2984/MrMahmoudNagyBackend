const express = require("express");
const router = express.Router();
const User = require("../models/User");

// ----------------- Get Students by Year & Group -----------------
router.get("/year/:yearId/group/:groupId", async (req, res) => {
  try {
    const { yearId, groupId } = req.params;

    const students = await User.find({
      role: "student",
      yearId,
      groupId,
    }).populate("parentId", "name email parentPhone");

    res.json(students);
  } catch (err) {
    console.error("❌ Error fetching students by group:", err);
    res.status(500).json({ msg: "❌ Failed to fetch students", error: err.message });
  }
});

// ----------------- Get Unassigned Students -----------------
router.get("/unassigned", async (req, res) => {
  try {
    const students = await User.find({
      role: "student",
      groupId: null,
    }).populate("parentId", "name email parentPhone");

    res.json(students);
  } catch (err) {
    console.error("❌ Error fetching unassigned students:", err);
    res.status(500).json({ msg: "❌ Failed to fetch unassigned students", error: err.message });
  }
});

// ----------------- Update Student & Parent -----------------
router.put("/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, email, studentPhone, parentName, parentPhone, parentEmail } = req.body;

    // 1. Find student
    const student = await User.findById(studentId);
    if (!student || student.role !== "student") {
      return res.status(404).json({ msg: "❌ Student not found" });
    }

    // 2. Update student fields
    if (name) student.name = name;
    if (email) student.email = email.toLowerCase();
    if (studentPhone) student.studentPhone = studentPhone;
    if (parentName) student.parentName = parentName;
    if (parentPhone) student.parentPhone = parentPhone;

    // 3. Handle parent record
    let parent = null;
    if (student.parentId) {
      parent = await User.findById(student.parentId);
    }

    if (parent) {
      if (parentName) parent.name = parentName;
      if (parentPhone) parent.parentPhone = parentPhone;
      if (parentEmail) parent.email = parentEmail.toLowerCase();
      await parent.save();
    } else if (parentEmail) {
      // If parent doesn't exist but new email provided → create one
      parent = new User({
        name: parentName,
        email: parentEmail.toLowerCase(),
        role: "parent",
        parentPhone,
        needsActivation: true,
      });
      await parent.save();
      student.parentId = parent._id;
    }

    await student.save();

    res.json({ msg: "✅ Student updated successfully", student, parent });
  } catch (err) {
    console.error("❌ Error updating student:", err);
    res.status(500).json({ msg: "❌ Failed to update student", error: err.message });
  }
});

// DELETE student + parent
router.delete("/:studentId", async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId);
    if (!student) return res.status(404).json({ msg: "❌ Student not found" });

    // Delete parent if exists
    if (student.parentId) {
      await User.findByIdAndDelete(student.parentId);
    }

    // Delete student
    await User.findByIdAndDelete(student._id);

    res.json({ msg: "✅ Student and parent deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting student", error: err.message });
  }
});

module.exports = router;
