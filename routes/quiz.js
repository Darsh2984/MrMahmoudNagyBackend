const express = require("express");
const Quiz = require("../models/Quiz");
const Group = require("../models/Group");
const QuizSubmission = require("../models/QuizSubmission");
const router = express.Router();

// Create Quiz
router.post("/", async (req, res) => {
  try {
    const { title, teacherId, groups, duration, questions, startTime, endTime } = req.body;

    if (!title || !teacherId || !groups?.length || !duration) {
      return res.status(400).json({ msg: "Title, teacher, groups, and duration are required" });
    }

    const quiz = new Quiz({
      title,
      teacherId,
      groups,
      duration,
      questions: questions || [],
      startTime,
      endTime,
    });

    await quiz.save();
    res.json(quiz);
  } catch (err) {
    console.error("❌ Error creating quiz:", err);
    res.status(500).json({ msg: "❌ Failed to create quiz", error: err.message });
  }
});

// Get all quizzes for teacher
router.get("/teacher/:teacherId", async (req, res) => {
  try {
    const quizzes = await Quiz.find({ teacherId: req.params.teacherId })
      .populate("groups", "name")
      .populate("questions", "imageUrl")
      .sort({ createdAt: -1 });

    res.json(quizzes);
  } catch (err) {
    console.error("❌ Error fetching quizzes:", err);
    res.status(500).json({ msg: "❌ Failed to fetch quizzes" });
  }
});

// Delete quiz
router.delete("/:quizId", async (req, res) => {
  try {
    await Quiz.findByIdAndDelete(req.params.quizId);
    res.json({ msg: "✅ Quiz deleted" });
  } catch (err) {
    console.error("❌ Error deleting quiz:", err);
    res.status(500).json({ msg: "❌ Failed to delete quiz" });
  }
});

// Get single quiz with safe question data
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

// Get all submissions for a quiz
router.get("/:quizId/submissions", async (req, res) => {
  try {
    const submissions = await QuizSubmission.find({ quizId: req.params.quizId })
      .populate("studentId", "name email") // student basic info
      .populate("quizId", "title");

    if (!submissions || submissions.length === 0) {
      return res.json([]);
    }

    // attach group info for each student
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



module.exports = router;
