const express = require("express");
const router = express.Router();

const Session = require("../models/Session");
const Task = require("../models/Task");
const Submission = require("../models/Submission");
const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission");

// Get full performance of a student inside a group
router.get("/:groupId/:studentId", async (req, res) => {
  try {
    const { groupId, studentId } = req.params;

    if (!groupId || groupId === "null") {
      return res.status(400).json({ msg: "❌ Student is not assigned to a group" });
    }

    // Attendance
    const sessions = await Session.find({ groupId }).populate("attendance.studentId");
    const attendance = sessions.map((s) => {
      const studentAttendance = s.attendance.find(
        (a) => a.studentId._id.toString() === studentId
      );
      return {
        date: s.createdAt,
        title: s.title,
        present: studentAttendance?.status === "Present",
      };
    });

    // Tasks
    const tasks = await Task.find({ groups: groupId });
    const submissions = await Submission.find({
      studentId,
      taskId: { $in: tasks.map((t) => t._id) },
    });
    const taskStatus = tasks.map((t) => ({
      _id: t._id,
      title: t.title,
      submitted: submissions.some((s) => s.taskId.toString() === t._id.toString()),
    }));

    // Quizzes
    const quizzes = await Quiz.find({ groups: groupId }).populate("questions");
    const quizSubmissions = await QuizSubmission.find({
      studentId,
      quizId: { $in: quizzes.map((q) => q._id) },
    }).populate("quizId", "title");

    const quizGrades = quizzes.map((q) => {
      const submission = quizSubmissions.find(
        (s) => s.quizId._id.toString() === q._id.toString()
      );
      return {
        quizTitle: q.title,
        score: submission ? submission.score : null, // adjust field if needed
        total: q.questions.length,
      };
    });

    res.json({
      attendance,
      tasks: taskStatus,
      quizzes: quizGrades,
    });
  } catch (err) {
    console.error("❌ Error fetching performance:", err);
    res.status(500).json({ msg: "❌ Failed to fetch performance", error: err.message });
  }
});

module.exports = router;
