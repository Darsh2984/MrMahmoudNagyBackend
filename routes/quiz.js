const express = require("express");
const Quiz = require("../models/Quiz");
const Group = require("../models/Group");
const QuizSubmission = require("../models/QuizSubmission");
const User = require("../models/User");
const { sendMessage } = require("../utils/wapilot");
const transporter = require("../config/nodemailer");

const router = express.Router();

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

  // ---------------- CREATE QUIZ ----------------
  router.post("/", async (req, res) => {
    try {
      let { title, teacherId, groups, duration, questions, startTime, endTime } = req.body;

      if (!title || !teacherId || !groups?.length || !duration) {
        return res.status(400).json({ msg: "Title, teacher, groups, and duration are required" });
      }

      teacherId = await resolveTeacherId(teacherId);
      if (!teacherId) {
        return res.status(404).json({ msg: "❌ Teacher not found" });
      }

      // ✅ Store UTC directly (frontend already sends in UTC ISO)
      const quiz = new Quiz({
        title,
        teacherId,
        groups,
        duration,
        questions: questions || [],
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
      });

      await quiz.save();

      // ✅ Send response immediately (don't wait for WhatsApp)
      res.json({ msg: "✅ Quiz created successfully", quiz });

      // ---------------- BACKGROUND NOTIFICATION TASK ----------------
      (async () => {
        try {
          const teacherLocalStart = new Date(startTime);
          const students = await User.find({ role: "student", groupId: { $in: groups } })
            .select("name email studentPhone parentPhone parentId")
            .populate("parentId", "name email parentPhone");

          const formattedStart = teacherLocalStart.toLocaleString("en-GB", {
            timeZone: "Africa/Cairo",
          });

          for (const student of students) {
            const msg = `📝 New Quiz Assigned\n\nTitle: ${title}\nStart Time: ${formattedStart} (Cairo Local Time)\nDuration: ${duration} mins`;

            // WhatsApp student
            if (student.studentPhone) {
              sendMessage(`${student.studentPhone}@c.us`, msg).catch((err) =>
                console.warn(`⚠️ Failed to send WhatsApp to ${student.name}:`, err.message)
              );
            }

            // WhatsApp parent
            const parentPhone = student.parentPhone || student.parentId?.parentPhone;
            if (parentPhone) {
              const parentMsg = `📢 Your child ${student.name} has a new quiz.\n\nTitle: ${title}\nStart Time: ${formattedStart} (Cairo Local Time)\nDuration: ${duration} mins`;
              sendMessage(`${parentPhone}@c.us`, parentMsg).catch((err) =>
                console.warn(`⚠️ Failed to send WhatsApp to parent of ${student.name}:`, err.message)
              );
            }
          }
        } catch (bgErr) {
          console.error("⚠️ Background WhatsApp error:", bgErr.message);
        }
      })();

      // ✅ The user gets the quiz creation result instantly.
    } catch (err) {
      console.error("❌ Error creating quiz:", err);
      res.status(500).json({ msg: "❌ Failed to create quiz", error: err.message });
    }
  });



// ---------------- GET ALL QUIZZES FOR TEACHER ----------------
router.get("/teacher/:teacherId", async (req, res) => {
  try {
    let teacherId = await resolveTeacherId(req.params.teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const quizzes = await Quiz.find({ teacherId })
      .populate("groups", "name")
      .populate("questions", "imageUrl")
      .sort({ createdAt: -1 });

    res.json(quizzes);
  } catch (err) {
    console.error("❌ Error fetching quizzes:", err);
    res.status(500).json({ msg: "❌ Failed to fetch quizzes" });
  }
});

// ---------------- DELETE QUIZ ----------------
router.delete("/:quizId/:teacherId", async (req, res) => {
  try {
    const { quizId, teacherId } = req.params;
    const resolvedTeacherId = await resolveTeacherId(teacherId);
    if (!resolvedTeacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ msg: "❌ Quiz not found" });
    }

    // ensure ownership
    if (quiz.teacherId.toString() !== resolvedTeacherId.toString()) {
      return res.status(403).json({ msg: "❌ Not authorized to delete this quiz" });
    }

    await Quiz.findByIdAndDelete(quizId);
    res.json({ msg: "✅ Quiz deleted" });
  } catch (err) {
    console.error("❌ Error deleting quiz:", err);
    res.status(500).json({ msg: "❌ Failed to delete quiz" });
  }
});

// ---------------- GET SINGLE QUIZ (safe data) ----------------
router.get("/id/:quizId", async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId)
      .populate("questions")
      .populate("groups", "name");

    if (!quiz) return res.status(404).json({ msg: "Quiz not found" });

    const safeQuiz = {
      ...quiz.toObject(),
      questions: quiz.questions.map((q) => ({
        _id: q._id,
        imageUrl: q.imageUrl,
        unitId: q.unitId,
        chapterId: q.chapterId,
      })),
    };

    res.json(safeQuiz);
  } catch (err) {
    console.error("❌ Error fetching quiz:", err);
    res.status(500).json({ msg: "❌ Failed to fetch quiz" });
  }
});

// ---------------- GET ALL SUBMISSIONS FOR QUIZ ----------------
router.get("/:quizId/submissions", async (req, res) => {
  try {
    const submissions = await QuizSubmission.find({ quizId: req.params.quizId })
      .populate("studentId", "name email")
      .populate("quizId", "title");

    if (!submissions || submissions.length === 0) {
      return res.json([]);
    }

    const formatted = await Promise.all(
      submissions.map(async (s) => {
        const group = await Group.findOne({ students: s.studentId._id }).select("name");
        return {
          studentId: s.studentId,
          groupName: group?.name || "—",
          score: s.score,
          total: s.answers.length,
        };
      })
    );

    res.json(formatted);
  } catch (err) {
    console.error("❌ Error fetching quiz submissions:", err);
    res.status(500).json({ msg: "❌ Failed to fetch quiz submissions" });
  }
});

// ---------------- GET STUDENT SUBMISSION DETAILS ----------------
router.get("/:quizId/submission/:studentId", async (req, res) => {
  try {
    const submission = await QuizSubmission.findOne({
      quizId: req.params.quizId,
      studentId: req.params.studentId,
    })
      .populate("quizId", "title")
      .populate("answers.questionId", "imageUrl correctAnswer");

    if (!submission) return res.status(404).json({ msg: "Submission not found" });

    res.json({
      score: submission.score,
      total: submission.answers.length,
      quizTitle: submission.quizId.title,
      answers: submission.answers,
    });
  } catch (err) {
    console.error("❌ Error fetching submission:", err);
    res.status(500).json({ msg: "Failed to fetch submission" });
  }
});

module.exports = router;
