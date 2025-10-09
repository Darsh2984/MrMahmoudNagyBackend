const express = require("express");
const InClassQuiz =  require("../models/InClassQuiz.js");
const Group = require("../models/Group.js");

const router = express.Router();

// 📘 Create new In-Class Quiz
router.post("/", async (req, res) => {
  try {
    const { teacherId, yearId, groupId, quizName, date, gradeOutOf } = req.body;

    // ✅ Populate student names directly from User model
    const group = await Group.findById(groupId).populate("students", "name email");

    if (!group) return res.status(404).json({ msg: "❌ Group not found" });

    const studentGrades = group.students.map((student) => ({
      studentId: student._id,
      grade: null,
    }));

    const quiz = new InClassQuiz({
      teacherId,
      yearId,
      groupId,
      quizName,
      date,
      gradeOutOf,
      studentGrades,
    });

    await quiz.save();

    res.json({ msg: "✅ Quiz created", quiz });
  } catch (err) {
    console.error("❌ Error creating In-Class Quiz:", err);
    res.status(500).json({ msg: "❌ Server error" });
  }
});

// 📋 Get all quizzes for group
router.get("/:groupId", async (req, res) => {
  try {
    const quizzes = await InClassQuiz.find({ groupId: req.params.groupId })
      .populate("studentGrades.studentId", "name email"); // ✅ populate from User schema

    res.json(quizzes);
  } catch (err) {
    console.error("❌ Error fetching quizzes:", err);
    res.status(500).json({ msg: "❌ Failed to fetch quizzes" });
  }
});


// ✏️ Update student grades
router.put("/:quizId/grades", async (req, res) => {
  try {
    const { studentGrades } = req.body; // array of { studentId, grade }

    const quiz = await InClassQuiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ msg: "Quiz not found" });

    quiz.studentGrades = studentGrades;
    await quiz.save();

    res.json({ msg: "✅ Grades updated successfully", quiz });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error updating grades" });
  }
});

module.exports = router;
