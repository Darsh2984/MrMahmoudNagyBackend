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


// ✏️ Update student grades + send WhatsApp messages
router.put("/:quizId/grades", async (req, res) => {
  try {
    const { studentGrades } = req.body; // array of { studentId, grade }

    const quiz = await InClassQuiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ msg: "❌ Quiz not found" });

    // ✅ Update all grades
    quiz.studentGrades = studentGrades;
    await quiz.save();

    // ✅ Loop through each graded student
    for (const sg of studentGrades) {
      if (sg.grade !== null && sg.grade !== undefined) {
        try {
          const student = await User.findById(sg.studentId)
            .select("name studentPhone parentPhone parentId")
            .populate("parentId", "name parentPhone");

          if (!student) continue;

          const studentMsg = `📘 In-Class Quiz Grade Added!\n\nQuiz: ${quiz.quizName}\nScore: ${sg.grade}/${quiz.gradeOutOf}\nDate: ${quiz.date?.toLocaleDateString?.() || "N/A"}`;
          const parentMsg = `📢 Your child ${student.name} received ${sg.grade}/${quiz.gradeOutOf} in "${quiz.quizName}".`;

          // 🔹 Send to student
          if (student.studentPhone) {
            try {
              await sendMessage(`${student.studentPhone}@c.us`, studentMsg);
              console.log(`✅ WhatsApp sent to student ${student.name}`);
            } catch (err) {
              console.warn(`⚠️ Failed to send WhatsApp to student ${student.name}:`, err.message);
            }
          }

          // 🔹 Send to parent
          const parentPhone = student.parentPhone || student.parentId?.parentPhone;
          if (parentPhone) {
            try {
              await sendMessage(`${parentPhone}@c.us`, parentMsg);
              console.log(`✅ WhatsApp sent to parent of ${student.name}`);
            } catch (err) {
              console.warn(`⚠️ Failed to send WhatsApp to parent of ${student.name}:`, err.message);
            }
          }
        } catch (innerErr) {
          console.warn("⚠️ Error sending message for a student:", innerErr.message);
        }
      }
    }

    res.json({ msg: "✅ Grades updated and messages sent", quiz });
  } catch (err) {
    console.error("❌ Error updating grades:", err);
    res.status(500).json({ msg: "❌ Error updating grades" });
  }
});

// ✏️ Edit existing In-Class Quiz (update name, date, gradeOutOf, and student grades)
router.put("/:quizId", async (req, res) => {
  try {
    const { quizName, date, gradeOutOf, studentGrades } = req.body;

    const quiz = await InClassQuiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ msg: "❌ Quiz not found" });

    // ✅ Update main details
    if (quizName) quiz.quizName = quizName;
    if (date) quiz.date = new Date(date);
    if (gradeOutOf) quiz.gradeOutOf = gradeOutOf;

    // ✅ Optionally update student grades if provided
    if (studentGrades && Array.isArray(studentGrades)) {
      quiz.studentGrades = studentGrades;
    }

    await quiz.save();

    res.json({ msg: "✅ Quiz updated successfully", quiz });
  } catch (err) {
    console.error("❌ Error updating In-Class Quiz:", err);
    res.status(500).json({ msg: "❌ Failed to update quiz", error: err.message });
  }
});

// 🗑️ Delete In-Class Quiz
router.delete("/:quizId", async (req, res) => {
  try {
    const quiz = await InClassQuiz.findByIdAndDelete(req.params.quizId);
    if (!quiz) return res.status(404).json({ msg: "❌ Quiz not found" });

    res.json({ msg: "✅ Quiz deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting In-Class Quiz:", err);
    res.status(500).json({ msg: "❌ Failed to delete quiz", error: err.message });
  }
});

module.exports = router;
