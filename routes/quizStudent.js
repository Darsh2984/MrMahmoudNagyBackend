const express = require("express");
const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const User = require("../models/User");
const QuizSubmission = require("../models/QuizSubmission");
const Group = require("../models/Group");
const { sendMessage } = require("../utils/wapilot");


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

// ✅ Get quizzes available for a student + submission status
router.get("/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId;

    const groups = await Group.find({ students: studentId }).select("_id");
    const groupIds = groups.map((g) => g._id);

    if (groupIds.length === 0) return res.json([]); // no groups → no quizzes

    const quizzes = await Quiz.find({ groups: { $in: groupIds } })
      .populate("groups", "name")
      .sort({ createdAt: -1 });

    const quizzesWithStatus = await Promise.all(
      quizzes.map(async (quiz) => {
        const submission = await QuizSubmission.findOne({
          quizId: quiz._id,
          studentId,
        });

        let hasStarted = false;
        let alreadySubmitted = false;
        let score = null;
        let total = quiz.questions.length;

        if (submission) {
          hasStarted = true;
          alreadySubmitted = submission.isSubmitted;
          score = submission.score;
          total = submission.answers.length || total;
        }

        return {
          ...quiz.toObject(),
          hasStarted,
          alreadySubmitted,
          score,
          total,
        };
      })
    );

    res.json(quizzesWithStatus);
  } catch (err) {
    console.error("❌ Error fetching student quizzes:", err);
    res.status(500).json({ msg: "Failed to fetch quizzes" });
  }
});

// Start a quiz attempt
router.post("/:quizId/start", async (req, res) => {
  try {
    const quizId = new mongoose.Types.ObjectId(req.params.quizId);
    const studentId = new mongoose.Types.ObjectId(req.body.studentId);

    const existing = await QuizSubmission.findOne({ quizId, studentId });
    if (existing)
      return res.status(200).json({ msg: "Quiz already started" });

    const submission = new QuizSubmission({
      quizId,
      studentId,
      score: 0,
      answers: [],
      startedAt: new Date(),
      isSubmitted: false,
    });

    await submission.save();
    res.json({ msg: "✅ Quiz started", startedAt: submission.startedAt });
  } catch (err) {
    console.error("❌ Error starting quiz:", err);
    res.status(500).json({ msg: "Failed to start quiz" });
  }
});

// ✅ Submit quiz answers
router.post("/:quizId/submit", async (req, res) => {
  try {
    const quizId = new mongoose.Types.ObjectId(req.params.quizId);
    const studentId = new mongoose.Types.ObjectId(req.body.studentId);
    const { answers } = req.body;

    const quiz = await Quiz.findById(quizId).populate("questions");
    if (!quiz) return res.status(404).json({ msg: "❌ Quiz not found" });

    const submission = await QuizSubmission.findOne({ quizId, studentId });
    if (!submission)
      return res.status(404).json({ msg: "❌ Quiz was not started" });

    // ✅ Prevent double submission
    if (submission.isSubmitted)
      return res.status(400).json({ msg: "❌ Quiz already submitted" });

    // ✅ Evaluate answers
    let score = 0;
    const evaluatedAnswers = quiz.questions.map((q) => {
      const studentAnswer = answers.find(
        (a) => a.questionId === q._id.toString()
      );
      const isCorrect = studentAnswer?.answer === q.correctAnswer;
      if (isCorrect) score++;
      return {
        questionId: q._id,
        answer: studentAnswer?.answer || null,
        isCorrect,
      };
    });

    // ✅ Update existing record
    submission.answers = evaluatedAnswers;
    submission.score = score;
    submission.isSubmitted = true;
    submission.submittedAt = new Date();

    await submission.save();

    // ✅ Notify student and parent
    const student = await User.findById(studentId)
      .select("name studentPhone parentPhone parentId")
      .populate("parentId", "name parentPhone");

    const total = quiz.questions.length;
    const studentMsg = `✅ Quiz Finished!\n\nTitle: ${quiz.title}\nScore: ${score}/${total}`;
    const parentMsg = `📢 Your child ${student.name} finished the quiz "${quiz.title}"\nScore: ${score}/${total}`;

    // 🔹 Send WhatsApp to student
    if (student.studentPhone) {
      try {
        await sendMessage(`${student.studentPhone}@c.us`, studentMsg);
        console.log(`✅ WhatsApp sent to student ${student.name}`);
      } catch (err) {
        console.warn(`⚠️ Failed to send WhatsApp to student:`, err.message);
      }
    }

    // 🔹 Send WhatsApp to parent
    const parentPhone = student.parentPhone || student.parentId?.parentPhone;
    if (parentPhone) {
      try {
        await sendMessage(`${parentPhone}@c.us`, parentMsg);
        console.log(`✅ WhatsApp sent to parent of ${student.name}`);
      } catch (err) {
        console.warn(`⚠️ Failed to send WhatsApp to parent:`, err.message);
      }
    }

    res.json({ msg: "✅ Quiz submitted", score, total });
  } catch (err) {
    console.error("❌ Error submitting quiz:", err);
    res.status(500).json({ msg: "Failed to submit quiz" });
  }
});

// Get student submission details
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

// 🔹 Get all submissions for a quiz (teacher or assistant view)
router.get("/:quizId/submissions/:teacherId", async (req, res) => {
  try {
    const { quizId, teacherId } = req.params;
    const resolvedTeacherId = await resolveTeacherId(teacherId);

    if (!resolvedTeacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    // verify that this quiz belongs to teacher (or their assistant)
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ msg: "Quiz not found" });

    if (quiz.teacherId.toString() !== resolvedTeacherId.toString()) {
      return res.status(403).json({ msg: "❌ Not authorized to view submissions for this quiz" });
    }

    const submissions = await QuizSubmission.find({ quizId })
      .populate("studentId", "name email")
      .populate("quizId", "title");

    if (!submissions || submissions.length === 0) {
      return res.json([]);
    }

    const formatted = submissions.map((s) => ({
      student: {
        id: s.studentId._id,
        name: s.studentId.name,
        email: s.studentId.email,
      },
      score: s.score,
      total: s.answers.length,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("❌ Error fetching quiz submissions:", err);
    res.status(500).json({ msg: "❌ Failed to fetch quiz submissions" });
  }
});

module.exports = router;
