const express = require("express");
const Quiz = require("../models/Quiz");
const User = require("../models/User");
const QuizSubmission = require("../models/QuizSubmission");
const Group = require("../models/Group");

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

// 🔹 Get quizzes available for a student + submission status
router.get("/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId;

    const groups = await Group.find({ students: studentId }).select("_id");
    const groupIds = groups.map((g) => g._id);

    if (groupIds.length === 0) {
      return res.json([]); // no groups → no quizzes
    }

    const quizzes = await Quiz.find({ groups: { $in: groupIds } })
      .populate("groups", "name")
      .sort({ createdAt: -1 });

    // For each quiz, check if submission exists
    const quizzesWithStatus = await Promise.all(
      quizzes.map(async (quiz) => {
        const submission = await QuizSubmission.findOne({ quizId: quiz._id, studentId });
        return {
          ...quiz.toObject(),
          alreadySubmitted: !!submission,
          score: submission?.score || null,
          total: submission?.answers.length || quiz.questions.length,
        };
      })
    );

    res.json(quizzesWithStatus);
  } catch (err) {
    console.error("❌ Error fetching student quizzes:", err);
    res.status(500).json({ msg: "Failed to fetch quizzes" });
  }
});

// 2️⃣ Submit quiz answers
router.post("/:quizId/submit", async (req, res) => {
  try {
    const { studentId, answers } = req.body;
    const quiz = await Quiz.findById(req.params.quizId).populate("questions");

    if (!quiz) return res.status(404).json({ msg: "Quiz not found" });

    // prevent double submission
    const existing = await QuizSubmission.findOne({ quizId: quiz._id, studentId });
    if (existing) return res.status(400).json({ msg: "Already submitted" });

    let score = 0;
    const evaluatedAnswers = quiz.questions.map((q) => {
      const studentAnswer = answers.find((a) => a.questionId === q._id.toString());
      const isCorrect = studentAnswer?.answer === q.correctAnswer;
      if (isCorrect) score++;
      return {
        questionId: q._id,
        answer: studentAnswer?.answer || null,
        isCorrect,
      };
    });

    const submission = new QuizSubmission({
      quizId: quiz._id,
      studentId,
      answers: evaluatedAnswers,
      score,
    });

    await submission.save();
    res.json({ msg: "✅ Quiz submitted", score, total: quiz.questions.length });
  } catch (err) {
    console.error("❌ Error submitting quiz:", err);
    res.status(500).json({ msg: "Failed to submit quiz" });
  }
});

// 3️⃣ Get student submission details
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
